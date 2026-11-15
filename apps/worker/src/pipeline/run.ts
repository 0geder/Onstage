import type { EventSourceName } from '@onstage/shared';
import { config } from '../config';
import { logger } from '../logger';
import { prisma } from '../prisma';
import { adapters } from '../sources';
import type { EventSourceAdapter, FetchWindow, SweepReport } from '../sources/types';
import { delistVanished } from './delist';
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
  /** Events retired because this pass no longer listed them. */
  delisted: number;
  /** Why the pass did not see the whole catalogue, when it did not. */
  incomplete?: string;
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
      select: { id: true, startedAt: true },
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
      delisted: 0,
    };

    const createdEventIds: string[] = [];
    const sweep: SweepReport = {};
    // Everything the source returned, written or not: an event that failed to
    // upsert was still listed, so it must not be retired for going unsynced.
    const seenSourceIds: string[] = [];

    try {
      for await (const event of adapter.fetchEvents(window, sweep)) {
        summary.fetched += 1;
        seenSourceIds.push(event.sourceId);
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
    summary.incomplete = sweep.incomplete;

    const skipDelisting = whyNotDelist(adapter, summary);
    if (skipDelisting) {
      logger.info(
        { source: adapter.name, tier, reason: skipDelisting },
        'Not retiring vanished listings after this pass',
      );
    } else {
      try {
        summary.delisted = await delistVanished({
          source: adapter.name,
          from: window.from,
          to: window.to,
          sweptAt: run.startedAt,
          seenSourceIds,
        });
      } catch (error) {
        logger.error(
          { source: adapter.name, err: (error as Error).message },
          'Retiring vanished listings failed',
        );
      }
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
        delisted: summary.delisted,
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

/**
 * Why absence from this pass must not retire anything, or null when it may.
 * Only a pass that saw the source's whole catalogue for the window can say a
 * listing has gone; anything less and a missing event may just be unseen.
 */
export function whyNotDelist(
  adapter: Pick<EventSourceAdapter, 'sweepsWholeCatalogue'>,
  summary: Pick<RunSummary, 'error' | 'incomplete' | 'fetched'>,
): string | null {
  if (!adapter.sweepsWholeCatalogue) return 'source is sampled, not swept';
  if (summary.error) return `run failed: ${summary.error}`;
  if (summary.incomplete) return `sweep incomplete: ${summary.incomplete}`;
  // An empty catalogue is far likelier to be an outage or a revoked key than
  // a source that genuinely has nothing on.
  if (summary.fetched === 0) return 'source returned nothing';
  return null;
}
