import { Injectable } from '@nestjs/common';
import type { Artist as ArtistRow } from '@prisma/client';
import type { ArtistSearchResult } from '@onstage/shared';
import { CacheKeys, CacheTtl } from '../../common/redis/cache-keys';
import { CacheService } from '../../common/redis/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ARTIST_COLUMNS } from '../../common/sql';
import { toArtistSummary, toEventSummary } from '../../common/mappers';

type ScoredArtist = ArtistRow & { score: number };

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Typo-tolerant artist search.
   *
   * Three matchers run together, because each catches what the others miss:
   *   - the generated tsvector handles whole-word and multi-word queries,
   *   - a prefix ILIKE handles the half-typed query behind every keystroke,
   *   - pg_trgm similarity handles the misspelling ("blk coffe" -> Black Coffee).
   *
   * Aliases are searched alongside names so stage names and older spellings
   * resolve to the same profile.
   */
  async searchArtists(rawQuery: string, limit = 20): Promise<ArtistSearchResult[]> {
    const query = rawQuery.trim();
    if (query.length < 2) return [];

    return this.cache.wrap(CacheKeys.search(query, limit), CacheTtl.search, async () => {
      const prefix = `${query}%`;

      const artists = await this.prisma.$queryRaw<ScoredArtist[]>`
        SELECT * FROM (
          SELECT ${ARTIST_COLUMNS},
                 GREATEST(
                   ts_rank(a.search_vector, plainto_tsquery('simple', ${query})) * 2.0,
                   CASE WHEN a.name ILIKE ${prefix} THEN 1.0 ELSE 0 END,
                   similarity(a.name, ${query}),
                   COALESCE(MAX(similarity(al.alias, ${query})), 0) * 0.9
                 )::float8 AS score,
                 (a.is_promoted AND (a.promoted_until IS NULL OR a.promoted_until > NOW()))
                   AS promotion_live
          FROM artists a
          LEFT JOIN artist_aliases al ON al.artist_id = a.id
          WHERE a.search_vector @@ plainto_tsquery('simple', ${query})
             OR a.name ILIKE ${prefix}
             OR a.name % ${query}
             OR al.alias ILIKE ${prefix}
             OR al.alias % ${query}
          GROUP BY a.id
        ) scored
        -- Promoted placement lifts an artist within its relevance band, never
        -- across one: rounding the score to a band means a paid result can
        -- outrank a peer, but never a materially better match.
        ORDER BY ROUND(score::numeric, 1) DESC,
                 promotion_live DESC,
                 score DESC,
                 verified DESC,
                 "followerCount" DESC
        LIMIT ${limit}
      `;

      if (artists.length === 0) return [];

      const nextEvents = await this.nextEventPerArtist(artists.map((artist) => artist.id));

      return artists.map((artist) => ({
        artist: toArtistSummary(artist),
        nextEvent: nextEvents.get(artist.id) ?? null,
        score: Number(artist.score.toFixed(4)),
      }));
    });
  }

  /**
   * One upcoming show per artist, counting support slots. Done as a single
   * DISTINCT ON pass rather than N queries so a page of results stays one round trip.
   */
  private async nextEventPerArtist(artistIds: string[]) {
    const rows = await this.prisma.$queryRaw<{ artist_id: string; event_id: string }[]>`
      SELECT DISTINCT ON (x.artist_id) x.artist_id, x.event_id
      FROM (
        SELECT e.primary_artist_id AS artist_id, e.id AS event_id, e.starts_at
        FROM events e
        WHERE e.primary_artist_id = ANY(${artistIds}::uuid[])
          AND e.starts_at >= NOW()
          AND e.status <> 'cancelled'
        UNION ALL
        SELECT el.artist_id, e.id AS event_id, e.starts_at
        FROM event_lineups el
        JOIN events e ON e.id = el.event_id
        WHERE el.artist_id = ANY(${artistIds}::uuid[])
          AND e.starts_at >= NOW()
          AND e.status <> 'cancelled'
      ) x
      ORDER BY x.artist_id, x.starts_at ASC
    `;

    if (rows.length === 0) return new Map<string, ReturnType<typeof toEventSummary>>();

    const events = await this.prisma.event.findMany({
      where: { id: { in: rows.map((row) => row.event_id) } },
      include: { primaryArtist: true, venue: true },
    });
    const byId = new Map(events.map((event) => [event.id, toEventSummary(event)]));

    const result = new Map<string, ReturnType<typeof toEventSummary>>();
    for (const row of rows) {
      const event = byId.get(row.event_id);
      if (event) result.set(row.artist_id, event);
    }
    return result;
  }
}
