import { haversineKm, normaliseName } from '@onstage/shared';
import { config } from '../config';
import { prisma } from '../prisma';
import type { NormalisedEvent } from '../sources/types';

/**
 * Deduplication.
 *
 * The same show arrives from three sources with three different titles, three
 * spellings of the venue and three ids. The spec's rule is the one implemented
 * here: normalised artist name, venue within 500 m, start time within 24 hours.
 *
 * Two deliberate choices:
 *
 *  - Venue matching is geographic, not textual. "The Assembly" and "Assembly
 *    (Harrington St)" never match as strings but are the same building, and
 *    coordinates say so.
 *  - Artist matching goes through aliases, because one source's "DJ Thabo" is
 *    another's "Thabo Mokoena".
 */

export interface DuplicateMatch {
  eventId: string;
  /** Why this was judged a duplicate, recorded for auditing bad merges. */
  reason: string;
  existingSource: string;
  isLocked: boolean;
}

export async function findDuplicate(
  candidate: NormalisedEvent,
): Promise<DuplicateMatch | null> {
  // An exact (source, sourceId) hit is the same record, not a duplicate — that
  // is an update, and the upsert handles it.
  const sameSource = await prisma.event.findFirst({
    where: { source: candidate.source, sourceId: candidate.sourceId },
    select: { id: true },
  });
  if (sameSource) return null;

  const windowMs = config.dedupeWindowHours * 3_600_000;
  const from = new Date(candidate.startsAt.getTime() - windowMs);
  const to = new Date(candidate.startsAt.getTime() + windowMs);

  // Narrow on time and geography in the database, where the GiST index helps,
  // then confirm the artist match in application code against aliases.
  const nearby = await prisma.$queryRaw<
    {
      id: string;
      source: string;
      is_locked: boolean;
      starts_at: Date;
      lat: number;
      lng: number;
      primary_artist_id: string;
    }[]
  >`
    SELECT e.id, e.source::text AS source, e.is_locked, e.starts_at, v.lat, v.lng, e.primary_artist_id
    FROM events e
    JOIN venues v ON v.id = e.venue_id
    WHERE e.starts_at BETWEEN ${from} AND ${to}
      AND ST_DWithin(
            v.geog,
            ST_SetSRID(ST_MakePoint(${candidate.venue.lng}, ${candidate.venue.lat}), 4326)::geography,
            ${config.dedupeRadiusMetres}
          )
  `;

  if (nearby.length === 0) return null;

  const candidateKey = normaliseName(candidate.primaryArtist.name);

  for (const row of nearby) {
    if (await artistMatches(row.primary_artist_id, candidateKey)) {
      const distanceKm = haversineKm(
        { lat: row.lat, lng: row.lng },
        { lat: candidate.venue.lat, lng: candidate.venue.lng },
      );
      const hoursApart =
        Math.abs(candidate.startsAt.getTime() - row.starts_at.getTime()) / 3_600_000;

      return {
        eventId: row.id,
        reason:
          `artist "${candidateKey}" matched, venue ${Math.round(distanceKm * 1000)}m away, ` +
          `start within ${hoursApart.toFixed(1)}h`,
        existingSource: row.source,
        isLocked: row.is_locked,
      };
    }
  }

  return null;
}

/** True when the stored artist's name or any alias normalises to the same key. */
async function artistMatches(artistId: string, candidateKey: string): Promise<boolean> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { name: true, aliases: { select: { normalisedAlias: true } } },
  });
  if (!artist) return false;

  if (normaliseName(artist.name) === candidateKey) return true;
  return artist.aliases.some((alias) => alias.normalisedAlias === candidateKey);
}

/**
 * Source precedence when two records describe the same show.
 *
 * Human curation always wins. Below that, ticketing providers beat aggregators,
 * because a ticketing API is the system of record for price and availability
 * while an aggregator is a copy of one.
 */
const SOURCE_PRECEDENCE: Record<string, number> = {
  manual: 100,
  artist_submitted: 90,
  quicket: 60,
  webtickets: 60,
  howler: 60,
  ticketmaster: 55,
  songkick: 30,
  bandsintown: 25,
};

export function shouldOverwrite(existingSource: string, incomingSource: string): boolean {
  const existing = SOURCE_PRECEDENCE[existingSource] ?? 0;
  const incoming = SOURCE_PRECEDENCE[incomingSource] ?? 0;
  return incoming > existing;
}
