import { logger } from './logger';
import { prisma } from './prisma';
import { runIngestion } from './pipeline/run';
import { drainOutbox } from './jobs/outbox';
import { awardBadges, confirmAttendance, promptLiveRatings } from './jobs/post-show';
import { queueOnSaleReminders, queuePriceDropAlerts, queueWeekendDigest } from './jobs/reminders';

/**
 * Run a single job by hand, for development and for operational recovery:
 *   npm run ingest -w @onstage/worker -- hot
 */
const TASKS: Record<string, () => Promise<unknown>> = {
  hot: () => runIngestion('hot'),
  cold: () => runIngestion('cold'),
  drain: () => drainOutbox(),
  'post-show': async () => {
    const confirmed = await confirmAttendance();
    const prompted = await promptLiveRatings();
    const badges = await awardBadges();
    return { confirmed, prompted, badges };
  },
  'on-sale': () => queueOnSaleReminders(),
  'price-drop': () => queuePriceDropAlerts(),
  digest: () => queueWeekendDigest(),
};

async function main(): Promise<void> {
  const task = process.argv[2];

  if (!task || !TASKS[task]) {
    logger.error(`Usage: npm run ingest -- <${Object.keys(TASKS).join('|')}>`);
    process.exitCode = 1;
    return;
  }

  const result = await TASKS[task]();
  logger.info({ task, result }, 'Task complete');
}

main()
  .catch((error) => {
    logger.error({ err: (error as Error).message }, 'Task failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
