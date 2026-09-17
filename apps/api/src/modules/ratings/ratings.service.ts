import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Rating } from '@onstage/shared';
import { CacheKeys } from '../../common/redis/cache-keys';
import { CacheService } from '../../common/redis/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { accountAgeHours, type AuthUser } from '../../common/auth/auth-user';

/** Accounts younger than this cannot rate. The cheapest defence against review bombing. */
const MIN_ACCOUNT_AGE_HOURS = 24;
/** Ratings for one artist within an hour above which we log a coordinated-burst warning. */
const BURST_THRESHOLD = 25;

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Overall artist rating — "do I rate this act" — editable at any time.
   */
  async rateArtist(
    user: AuthUser,
    artistId: string,
    input: { score: number; reviewText?: string },
  ): Promise<Rating> {
    this.assertEligible(user);

    const artist = await this.prisma.artist.findUnique({
      where: { id: artistId },
      select: { id: true },
    });
    if (!artist) throw new NotFoundException('Artist not found.');

    const existing = await this.prisma.rating.findFirst({
      where: { userId: user.id, artistId, eventId: null },
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.rating.update({
            where: { id: existing.id },
            data: { score: input.score, reviewText: input.reviewText ?? null },
          })
        : await tx.rating.create({
            data: {
              userId: user.id,
              artistId,
              eventId: null,
              score: input.score,
              reviewText: input.reviewText ?? null,
            },
          });

      await this.recomputeAggregates(tx, artistId);
      return saved;
    });

    await this.detectBurst(artistId);
    await this.cache.invalidate(CacheKeys.artist(artistId));
    return this.toRating(row);
  }

  /**
   * Live performance rating — the one nobody else owns.
   *
   * Gated on the user having actually been marked as attending that show, which
   * is set after the event rather than claimed by the client. That gate is the
   * whole value of this number.
   */
  async rateLivePerformance(
    user: AuthUser,
    eventId: string,
    input: { score: number; reviewText?: string },
  ): Promise<Rating> {
    this.assertEligible(user);

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, primaryArtistId: true, startsAt: true },
    });
    if (!event) throw new NotFoundException('Event not found.');
    if (event.startsAt > new Date()) {
      throw new BadRequestException('You can rate a performance once the show has happened.');
    }

    const attendance = await this.prisma.attendance.findUnique({
      where: { userId_eventId: { userId: user.id, eventId } },
      select: { state: true },
    });
    if (attendance?.state !== 'attended') {
      throw new ForbiddenException('Only people who attended this show can rate the performance.');
    }

    const existing = await this.prisma.rating.findFirst({
      where: { userId: user.id, eventId },
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.rating.update({
            where: { id: existing.id },
            data: { score: input.score, reviewText: input.reviewText ?? null },
          })
        : await tx.rating.create({
            data: {
              userId: user.id,
              artistId: event.primaryArtistId,
              eventId,
              score: input.score,
              reviewText: input.reviewText ?? null,
            },
          });

      await this.recomputeAggregates(tx, event.primaryArtistId);
      return saved;
    });

    await this.cache.invalidate(CacheKeys.artist(event.primaryArtistId));
    return this.toRating(row);
  }

  async listForArtist(artistId: string, limit: number) {
    const rows = await this.prisma.rating.findMany({
      where: { artistId, reviewText: { not: null } },
      include: { user: { select: { handle: true, displayName: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      score: row.score,
      reviewText: row.reviewText,
      /** Live ratings are labelled distinctly — they answer a different question. */
      kind: row.eventId ? ('live' as const) : ('overall' as const),
      createdAt: row.createdAt.toISOString(),
      author: row.user,
    }));
  }

  async mine(userId: string, limit: number) {
    const rows = await this.prisma.rating.findMany({
      where: { userId },
      include: { artist: { select: { id: true, name: true, slug: true, profileImage: true } } },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({ ...this.toRating(row), artist: row.artist }));
  }

  async remove(user: AuthUser, ratingId: string) {
    const rating = await this.prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw new NotFoundException('Rating not found.');
    if (rating.userId !== user.id && !user.isAdmin) {
      throw new ForbiddenException('You can only remove your own rating.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rating.delete({ where: { id: ratingId } });
      await this.recomputeAggregates(tx, rating.artistId);
    });

    await this.cache.invalidate(CacheKeys.artist(rating.artistId));
    return { deleted: true };
  }

  /**
   * Overall and live averages are recomputed from the rows rather than adjusted
   * incrementally. It costs one extra query per write and removes a whole class
   * of drift bug from the number that sits at the top of every profile.
   */
  private async recomputeAggregates(tx: Prisma.TransactionClient, artistId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE artists a
      SET rating_avg = overall.avg,
          rating_count = overall.count,
          live_rating_avg = live.avg,
          live_rating_count = live.count
      FROM (
        SELECT ROUND(AVG(score)::numeric, 2)::float8 AS avg, COUNT(*)::int AS count
        FROM ratings WHERE artist_id = ${artistId}::uuid AND event_id IS NULL
      ) overall,
      (
        SELECT ROUND(AVG(score)::numeric, 2)::float8 AS avg, COUNT(*)::int AS count
        FROM ratings WHERE artist_id = ${artistId}::uuid AND event_id IS NOT NULL
      ) live
      WHERE a.id = ${artistId}::uuid
    `;
  }

  private assertEligible(user: AuthUser): void {
    if (accountAgeHours(user) < MIN_ACCOUNT_AGE_HOURS) {
      throw new ForbiddenException(
        'Accounts need to be 24 hours old before rating. This keeps ratings honest.',
      );
    }
  }

  /**
   * Coordinated bursts are logged rather than blocked: a genuine viral moment
   * looks the same from here, and silently dropping real ratings is worse than
   * flagging them for a human. The admin anomaly report reads the same window.
   */
  private async detectBurst(artistId: string): Promise<void> {
    const recent = await this.prisma.rating.count({
      where: { artistId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= BURST_THRESHOLD) {
      this.logger.warn(`Rating burst on artist ${artistId}: ${recent} ratings in the last hour.`);
    }
  }

  private toRating(row: {
    id: string;
    artistId: string;
    eventId: string | null;
    score: number;
    reviewText: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Rating {
    return {
      id: row.id,
      artistId: row.artistId,
      eventId: row.eventId,
      score: row.score,
      reviewText: row.reviewText,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
