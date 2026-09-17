import { Cron } from 'croner';
import { config } from './config';
import { logger } from './logger';
import { prisma } from './prisma';
import { runIngestion } from './pipeline/run';
import { drainOutbox } from './jobs/outbox';
import { awardBadges, confirmAttendance, promptLiveRatings } from './jobs/post-show';
import { queueOnSaleReminders, queuePriceDropAlerts, queueWeekendDigest } from './jobs/reminders';

/**
 * The scheduled worker.
 *
 * Jobs never overlap with themselves (`protect: true`), because a slow ingestion
 * pass overlapping the next one would double-write and distort every counter.
 */

const jobs: Cron[] = [];

function schedule(name: string, pattern: string, task: () => Promise<unknown>): void {
  const job = new Cron(pattern, { name, protect: true }, async () => {
    const started = Date.now();
    try {
      await task();
      logger.debug({ job: name, ms: Date.now() - started }, 'Job finished');
    } catch (error) {
      // A failing job logs and waits for its next tick; it never takes the
      // process down and never blocks the other jobs.
      logger.error({ job: name, err: (error as Error).message }, 'Job failed');
    }
  });
  jobs.push(job);
  logger.info({ job: name, pattern, next: job.nextRun()?.toISOString() }, 'Scheduled');
}

async function main(): Promise<void> {
  logger.info(
    { markets: config.markets, ingestion: config.ingestionEnabled },
    'Onstage worker starting',
  );

  schedule('ingestion:hot', config.hotCron, () => runIngestion('hot'));
  schedule('ingestion:cold', config.coldCron, () => runIngestion('cold'));

  schedule('notifications:drain', config.notificationsCron, () => drainOutbox());

  // Hourly: confirm attendance, then prompt for ratings and award badges in
  // that order, because each step depends on the previous one having run.
  schedule('post-show', '15 * * * *', async () => {
    await confirmAttendance();
    await promptLiveRatings();
    await awardBadges();
  });

  schedule('reminders:on-sale', '*/30 * * * *', () => queueOnSaleReminders());
  schedule('reminders:price-drop', '20 * * * *', () => queuePriceDropAlerts());
  // Thursday morning, while the weekend is still plannable.
  schedule('reminders:weekend-digest', '0 9 * * 4', () => queueWeekendDigest());

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    for (const job of jobs) job.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
