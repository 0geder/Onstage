import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Artist as ArtistRow } from '@prisma/client';
import type { Artist, ArtistSummary, EventSummary, Paginated } from '@onstage/shared';
import { CacheKeys, CacheTtl } from '../../common/redis/cache-keys';
import { CacheService } from '../../common/redis/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ARTIST_COLUMNS } from '../../common/sql';
import { decodeCursor, pageOf } from '../../common/util/cursor';
import { toArtist, toArtistSummary, toEventSummary } from '../../common/mappers';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventScope = 'upcoming' | 'past';

@Injectable()
export class ArtistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Profiles are addressable by either UUID or slug, so shared links stay readable. */
  async findOne(idOrSlug: string): Promise<Artist> {
    const cached = await this.cache.get<Artist>(CacheKeys.artist(idOrSlug));
    if (cached) return cached;

    const row = await this.prisma.artist.findFirst({
      where: UUID_PATTERN.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    });
    if (!row) throw new NotFoundException(`No artist matches "${idOrSlug}".`);

    const artist = toArtist(row);
    await this.cache.set(CacheKeys.artist(idOrSlug), artist, CacheTtl.artist);
    return artist;
  }

  async findRowOrFail(id: string): Promise<ArtistRow> {
    const row = await this.prisma.artist.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Artist not found.');
    return row;
  }

  /**
   * Shows the artist appears on, headlining or not — a support slot counts, so
   * an artist who only ever opens still has a populated profile.
   */
  async events(
    artistId: string,
    scope: EventScope,
    limit: number,
    cursor?: string,
  ): Promise<Paginated<EventSummary>> {
    await this.findRowOrFail(artistId);
    const keyset = decodeCursor(cursor);
    const now = new Date();

    const timeFilter: Prisma.EventWhereInput =
      scope === 'upcoming' ? { startsAt: { gte: now } } : { startsAt: { lt: now } };

    const cursorFilter: Prisma.EventWhereInput = keyset
      ? scope === 'upcoming'
        ? {
            OR: [
              { startsAt: { gt: new Date(keyset.value) } },
              { startsAt: new Date(keyset.value), id: { gt: keyset.id } },
            ],
          }
        : {
            OR: [
              { startsAt: { lt: new Date(keyset.value) } },
              { startsAt: new Date(keyset.value), id: { gt: keyset.id } },
            ],
          }
      : {};

    const rows = await this.prisma.event.findMany({
      where: {
        AND: [
          timeFilter,
          cursorFilter,
          { status: { not: 'cancelled' } },
          {
            OR: [{ primaryArtistId: artistId }, { lineup: { some: { artistId } } }],
          },
        ],
      },
      include: { primaryArtist: true, venue: true },
      orderBy:
        scope === 'upcoming'
          ? [{ startsAt: 'asc' }, { id: 'asc' }]
          : [{ startsAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const page = pageOf(rows, limit, (row) => ({
      value: row.startsAt.toISOString(),
      id: row.id,
    }));

    return {
      items: page.items.map((row) => toEventSummary(row)),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Similar artists, in two passes: artists who have actually shared a stage
   * with this one, then padded out by genre. Shared bills beat genre tags
   * because they reflect what promoters and fans already treat as adjacent.
   */
  async similar(artistId: string, limit = 12): Promise<ArtistSummary[]> {
    return this.cache.wrap(CacheKeys.similarArtists(artistId), CacheTtl.similarArtists, async () => {
      const artist = await this.findRowOrFail(artistId);

      const coBilled = await this.prisma.$queryRaw<(ArtistRow & { shared: number })[]>`
        SELECT ${ARTIST_COLUMNS}, COUNT(*)::int AS shared
        FROM event_lineups el
        JOIN artists a ON a.id = el.artist_id
        WHERE el.event_id IN (
                SELECT event_id FROM event_lineups WHERE artist_id = ${artistId}::uuid
              )
          AND el.artist_id <> ${artistId}::uuid
        GROUP BY a.id
        ORDER BY shared DESC, a.follower_count DESC
        LIMIT ${limit}
      `;

      if (coBilled.length >= limit || artist.genres.length === 0) {
        return coBilled.map(toArtistSummary);
      }

      const exclude = [artistId, ...coBilled.map((row) => row.id)];
      const byGenre = await this.prisma.artist.findMany({
        where: { id: { notIn: exclude }, genres: { hasSome: artist.genres } },
        orderBy: [{ followerCount: 'desc' }],
        take: limit - coBilled.length,
      });

      return [...coBilled, ...byGenre].map(toArtistSummary);
    });
  }

  /**
   * Follow is idempotent, and the denormalised counter moves in the same
   * transaction as the row so the profile never shows a stale number.
   */
  async follow(userId: string, artistId: string): Promise<{ following: true; followerCount: number }> {
    await this.findRowOrFail(artistId);

    const followerCount = await this.prisma.$transaction(async (tx) => {
      const created = await tx.follow.createMany({
        data: { userId, artistId },
        skipDuplicates: true,
      });
      if (created.count === 0) {
        const current = await tx.artist.findUniqueOrThrow({
          where: { id: artistId },
          select: { followerCount: true },
        });
        return current.followerCount;
      }
      const updated = await tx.artist.update({
        where: { id: artistId },
        data: { followerCount: { increment: 1 } },
        select: { followerCount: true },
      });
      return updated.followerCount;
    });

    await this.cache.invalidate(CacheKeys.artist(artistId));
    return { following: true, followerCount };
  }

  async unfollow(
    userId: string,
    artistId: string,
  ): Promise<{ following: false; followerCount: number }> {
    const followerCount = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.follow.deleteMany({ where: { userId, artistId } });
      if (deleted.count === 0) {
        const current = await tx.artist.findUniqueOrThrow({
          where: { id: artistId },
          select: { followerCount: true },
        });
        return current.followerCount;
      }
      // GREATEST rather than `decrement`, so any historical drift can never
      // push the displayed count below zero.
      const [updated] = await tx.$queryRaw<{ follower_count: number }[]>`
        UPDATE artists
        SET follower_count = GREATEST(follower_count - 1, 0)
        WHERE id = ${artistId}::uuid
        RETURNING follower_count
      `;
      return updated?.follower_count ?? 0;
    });

    await this.cache.invalidate(CacheKeys.artist(artistId));
    return { following: false, followerCount };
  }

  async isFollowing(userId: string, artistId: string): Promise<boolean> {
    const row = await this.prisma.follow.findUnique({
      where: { userId_artistId: { userId, artistId } },
    });
    return row !== null;
  }
}
