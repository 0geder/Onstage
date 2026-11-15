import type { EventSourceName } from '@onstage/shared';
import { prisma } from '../prisma';

/**
 * Retiring listings a source has stopped showing.
 *
 * Organisers delete and re-list events all the time (a new date, a fixed
 * typo, a second show replacing the first), and the source simply stops
 * returning the old listing. Left alone it would sit in the feed as "on sale"
 * forever with a dead ticket link. Nothing tells us why it went, so it is not
 * marked cancelled: it is marked delisted, which hides it from discovery while
 * links people already have keep working.
 */

/**
 * How long a listing must have been missing before it is retired. Long enough
 * to ride out a source briefly hiding a listing (an organiser editing it, a
 * flaky search index) across a couple of daily cold sweeps, short enough that
 * a vanished gig does not keep collecting plans for a week.
 */
export const DELIST_GRACE_MS = 3 * 86_400_000;

export interface DelistScope {
  source: EventSourceName;
  /** The window the sweep covered. Events outside it were never looked for. */
  from: Date;
  to: Date;
  /** When the sweep started; anything it returned was synced after this. */
  sweptAt: Date;
  /** Source ids the sweep returned, which are listed whether or not they were written. */
  seenSourceIds?: string[];
}

/**
 * Marks delisted the events of `source` in the swept window that the source
 * has not returned for longer than the grace period. Call only after a sweep
 * that saw the source's whole catalogue for the window.
 *
 * Only events still ahead are considered: a source dropping yesterday's show
 * once it has happened says nothing about the show. Locked events belong to a
 * curator and cancelled ones already say what happened, so neither is touched.
 */
export async function delistVanished(scope: DelistScope): Promise<number> {
  const earliest = scope.from > scope.sweptAt ? scope.from : scope.sweptAt;
  const result = await prisma.event.updateMany({
    where: {
      source: scope.source,
      ...(scope.seenSourceIds?.length ? { sourceId: { notIn: scope.seenSourceIds } } : {}),
      delistedAt: null,
      isLocked: false,
      status: { not: 'cancelled' },
      startsAt: { gte: earliest, lte: scope.to },
      lastSyncedAt: { lt: new Date(scope.sweptAt.getTime() - DELIST_GRACE_MS) },
    },
    data: { delistedAt: new Date() },
  });
  return result.count;
}
