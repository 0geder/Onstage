// Must stay the first import: Sentry instruments modules as they load.
import { Sentry } from './instrument';
import { Cron } from 'croner';
import { config } from './config';
import { withJobLock } from './job-lock';
import { logger } from './logger';
import { prisma } from './prisma';
import { runIngestion } from './pipeline/run';
import { executeAccountDeletions } from './jobs/account-deletion';
import { drainOutbox } from './jobs/outbox';
import { awardBadges, confirmAttendance, promptLiveRatings } from './jobs/post-show';
import {
  queueOnSaleReminders,
  queuePriceDropAlerts,
  queueTicketsBackAlerts,
  queueWeekendDigest,
} from './jobs/reminders';

/**
 * The scheduled worker.
 *
 * Jobs never overlap with themselves: `protect: true` covers this process, and
 * a Postgres advisory lock (job-lock.ts) covers other replicas, because a slow
 * ingestion pass overlapping the next one would double-write and distort every
 * counter. Cron patterns are read in config.timezone, so "09:00 Thursday" is
 * local time rather than UTC.
 */

const jobs: Cron[] = [];
const running = new Set<Promise<unknown>>();

function schedule(name: string, pattern: string, task: () => Promise<unknown>): void {
  const job = new Cron(pattern, { name, protect: true, timezone: config.timezone }, async () => {
    const started = Date.now();
    const run = withJobLock(name, task);
    running.add(run);
    try {
      const outcome = await run;
      if (outcome.ran) logger.debug({ job: name, ms: Date.now() - started }, 'Job finished');
      else logger.debug({ job: name }, 'Job skipped: another replica holds the lock');
    } catch (error) {
      // A failing job logs and waits for its next tick; it never takes the
      // process down and never blocks the other jobs.
      logger.error({ job: name, err: (error as Error).message }, 'Job failed');
      Sentry.captureException(error, { tags: { job: name } });
    } finally {
      running.delete(run);
    }
  });
  jobs.push(job);
  logger.info({ job: name, pattern, next: job.nextRun()?.toISOString() }, 'Scheduled');
}

async function main(): Promise<void> {
  logger.info(
    { markets: config.markets, ingestion: config.ingestionEnabled, timezone: config.timezone },
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
  // Restocks sell out again fast, so this runs far more often than price drops.
  schedule('reminders:tickets-back', '*/10 * * * *', () => queueTicketsBackAlerts());
  // Thursday morning, while the weekend is still plannable.
  schedule('reminders:weekend-digest', '0 9 * * 4', () => queueWeekendDigest());

  // POPIA: carry out deletion requests once their grace period has passed.
  schedule('account-deletion', config.accountDeletion.cron, () => executeAccountDeletions());

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal, inFlight: running.size }, 'Shutting down');
    for (const job of jobs) job.stop();

    // Let running jobs finish (their transactions commit and locks release),
    // but never hang a deploy on a stuck job.
    const timeout = new Promise((resolve) => setTimeout(resolve, config.shutdownTimeoutMs));
    await Promise.race([Promise.allSettled([...running]), timeout]);

    await Promise.all([prisma.$disconnect(), Sentry.flush(2000)]);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
