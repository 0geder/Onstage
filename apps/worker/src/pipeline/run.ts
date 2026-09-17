import type { EventSourceName } from '@onstage/shared';
import { config } from '../config';
import { logger } from '../logger';
import { prisma } from '../prisma';
import { adapters } from '../sources';
import type { FetchWindow } from '../sources/types';
import { upsertEvent } from './upsert';
import { enqueueNewEventAnnouncements } from '../jobs/announcements';

/**
 * One ingestion pass.
 *
 * `hot` runs hourly across a short horizon, because prices and availability on
 * imminent shows move constantly. `cold` sweeps the long tail daily. Every run
 * is recorded in ingestion_runs — coverage is the product here, so a silent
 * failure to ingest is a product outage, not a background-job hiccup.
 */

const HORIZONS = {
  // Hot: everything close enough that someone is deciding about it right now.
  hot: { fromDays: -1, toDays: 45 },
  cold: { fromDays: -1, toDays: 365 },
} as const;

export interface RunSummary {
  source: EventSourceName;
  tier: 'hot' | 'cold';
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  deduped: number;
  failed: number;
  error?: string;
}

export async function runIngestion(tier: 'hot' | 'cold'): Promise<RunSummary[]> {
  if (!config.ingestionEnabled) {
    logger.warn('Ingestion is disabled (INGESTION_ENABLED=false)');
    return [];
  }

  const enabled = adapters.filter((adapter) => adapter.isEnabled());
  if (enabled.length === 0) {
    logger.warn(
      'No ingestion adapters are configured. Set provider credentials, or curate events in the admin CMS.',
    );
    return [];
  }

  const horizon = HORIZONS[tier];
  const window: FetchWindow = {
    tier,
    from: new Date(Date.now() + horizon.fromDays * 86_400_000),
    to: new Date(Date.now() + horizon.toDays * 86_400_000),
    markets: config.markets,
  };

  const summaries: RunSummary[] = [];

  for (const adapter of enabled) {
    const run = await prisma.ingestionRun.create({
      data: { source: adapter.name, tier },
      select: { id: true },
    });

    const summary: RunSummary = {
      source: adapter.name,
      tier,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      deduped: 0,
      failed: 0,
    };

    const createdEventIds: string[] = [];

    try {
      for await (const event of adapter.fetchEvents(window)) {
        summary.fetched += 1;
        try {
          const outcome = await upsertEvent(event);
          switch (outcome.action) {
            case 'created':
              summary.created += 1;
              if (outcome.eventId) createdEventIds.push(outcome.eventId);
              break;
            case 'updated':
              summary.updated += 1;
              break;
            case 'skipped':
              summary.skipped += 1;
              break;
            case 'deduped':
              summary.deduped += 1;
              break;
          }
        } catch (error) {
          // One malformed event must not end the run.
          summary.failed += 1;
          logger.warn(
            { source: adapter.name, sourceId: event.sourceId, err: (error as Error).message },
            'Failed to upsert event',
          );
        }
      }
    } catch (error) {
      summary.error = (error as Error).message;
      logger.error({ source: adapter.name, err: summary.error }, 'Ingestion run failed');
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        fetched: summary.fetched,
        created: summary.created,
        updated: summary.updated,
        skipped: summary.skipped,
        deduped: summary.deduped,
        failed: summary.failed,
        error: summary.error ?? null,
      },
    });

    // Fan out announcements only for genuinely new events, after the run has
    // been recorded, so a crash mid-run cannot produce a burst of duplicate pushes.
    if (createdEventIds.length > 0) {
      await enqueueNewEventAnnouncements(createdEventIds);
    }

    logger.info({ ...summary }, `Ingestion pass complete: ${adapter.name} (${tier})`);
    summaries.push(summary);
  }

  return summaries;
}
