import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_NOTIFICATION_PREFS,
  isSupportedLocale,
  type NotificationPrefs,
} from '@onstage/shared';
import { toArtistSummary, toEventSummary } from '../../common/mappers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConsentService } from '../consent/consent.service';
import type { AuthUser } from '../../common/auth/auth-user';

export interface UpdateProfileInput {
  displayName?: string;
  handle?: string;
  avatar?: string | null;
  homeLat?: number;
  homeLng?: number;
  homeCity?: string;
  locale?: string;
  notificationPrefs?: Partial<NotificationPrefs>;
}

export interface OnboardingInput {
  genres: string[];
  artistIds: string[];
  locale?: string;
}

/** The feed is only worth opening if it has something in it on day one. */
const MIN_ONBOARDING_FOLLOWS = 3;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        handle: true,
        displayName: true,
        email: true,
        avatar: true,
        homeLat: true,
        homeLng: true,
        homeCity: true,
        notificationPrefs: true,
        locale: true,
        onboardedAt: true,
        onboardingGenres: true,
        deletionRequestedAt: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    const [followCount, goingCount, ratingCount] = await Promise.all([
      this.prisma.follow.count({ where: { userId } }),
      this.prisma.attendance.count({ where: { userId, state: 'going' } }),
      this.prisma.rating.count({ where: { userId } }),
    ]);

    return {
      ...user,
      // Merged so a client always receives every key, including ones added
      // after this user last saved their preferences.
      notificationPrefs: {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(user.notificationPrefs as Record<string, unknown>),
      },
      counts: { following: followCount, going: goingCount, ratings: ratingCount },
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    if (input.handle) {
      const taken = await this.prisma.user.findFirst({
        where: { handle: input.handle, id: { not: userId } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('That handle is already taken.');
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.handle !== undefined) data.handle = input.handle;
    if (input.avatar !== undefined) data.avatar = input.avatar;
    // Coordinates are only held with location consent (POPIA). Without it they
    // are dropped rather than rejected, so the rest of the profile still saves.
    if (input.homeLat !== undefined || input.homeLng !== undefined) {
      if (await this.consent.hasConsent(userId, 'location')) {
        if (input.homeLat !== undefined) data.homeLat = input.homeLat;
        if (input.homeLng !== undefined) data.homeLng = input.homeLng;
      }
    }
    if (input.homeCity !== undefined) data.homeCity = input.homeCity;
    if (input.locale !== undefined) {
      if (!isSupportedLocale(input.locale)) {
        throw new BadRequestException('Unsupported language.');
      }
      data.locale = input.locale;
    }
    if (input.notificationPrefs !== undefined) {
      // Merged rather than replaced, so a partial update cannot silently switch
      // off a category the client did not know about.
      const existing = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { notificationPrefs: true },
      });
      data.notificationPrefs = {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(existing.notificationPrefs as Record<string, unknown>),
        ...input.notificationPrefs,
      } as Prisma.InputJsonValue;
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.me(userId);
  }

  async following(userId: string, limit: number) {
    const rows = await this.prisma.follow.findMany({
      where: { userId },
      include: { artist: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => toArtistSummary(row.artist));
  }

  /** Shows the user has said they are going to, upcoming first. */
  async upcomingPlans(userId: string, limit: number) {
    const rows = await this.prisma.attendance.findMany({
      where: {
        userId,
        state: { in: ['interested', 'going'] },
        event: { startsAt: { gte: new Date() }, status: { not: 'cancelled' } },
      },
      include: { event: { include: { primaryArtist: true, venue: true } } },
      orderBy: { event: { startsAt: 'asc' } },
      take: limit,
    });

    return rows.map((row) => ({
      state: row.state,
      event: toEventSummary(row.event),
    }));
  }

  /**
   * Shows the user attended but has not yet rated. This is what the morning-after
   * push notification links into.
   */
  async pendingLiveRatings(user: AuthUser) {
    const attended = await this.prisma.attendance.findMany({
      where: { userId: user.id, state: 'attended' },
      include: { event: { include: { primaryArtist: true, venue: true } } },
      orderBy: { event: { startsAt: 'desc' } },
      take: 20,
    });
    if (attended.length === 0) return [];

    const rated = await this.prisma.rating.findMany({
      where: { userId: user.id, eventId: { in: attended.map((row) => row.eventId) } },
      select: { eventId: true },
    });
    const ratedIds = new Set(rated.map((row) => row.eventId));

    return attended
      .filter((row) => !ratedIds.has(row.eventId))
      .map((row) => toEventSummary(row.event));
  }

  /**
   * Completes onboarding: pick genres, follow a few artists, set a language.
   *
   * The follow minimum is the whole point — an empty "From artists you follow"
   * section on first open is the fastest way to lose a new user, so the feed is
   * never reached before there is something in it.
   */
  async completeOnboarding(userId: string, input: OnboardingInput) {
    const artistIds = [...new Set(input.artistIds)];
    if (artistIds.length < MIN_ONBOARDING_FOLLOWS) {
      throw new BadRequestException(
        `Follow at least ${MIN_ONBOARDING_FOLLOWS} artists so your feed has something in it.`,
      );
    }

    const existing = await this.prisma.artist.findMany({
      where: { id: { in: artistIds } },
      select: { id: true },
    });
    if (existing.length !== artistIds.length) {
      throw new BadRequestException('One or more of those artists does not exist.');
    }

    if (input.locale && !isSupportedLocale(input.locale)) {
      throw new BadRequestException('Unsupported language.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Read what is already followed first, so the counter is incremented for
      // exactly the rows this call creates and re-running onboarding is a no-op.
      const already = await tx.follow.findMany({
        where: { userId, artistId: { in: artistIds } },
        select: { artistId: true },
      });
      const alreadyIds = new Set(already.map((row) => row.artistId));
      const freshIds = artistIds.filter((id) => !alreadyIds.has(id));

      if (freshIds.length > 0) {
        await tx.follow.createMany({
          data: freshIds.map((artistId) => ({ userId, artistId })),
          skipDuplicates: true,
        });
        await tx.artist.updateMany({
          where: { id: { in: freshIds } },
          data: { followerCount: { increment: 1 } },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          onboardedAt: new Date(),
          onboardingGenres: input.genres.slice(0, 20),
          ...(input.locale ? { locale: input.locale } : {}),
        },
      });
    });

    return this.me(userId);
  }

  /** Genres worth offering during onboarding: the ones the catalogue actually has. */
  async popularGenres(limit = 24) {
    return this.prisma.$queryRaw<{ genre: string; artists: number }[]>`
      SELECT genre, COUNT(*)::int AS artists
      FROM artists, UNNEST(genres) AS genre
      GROUP BY genre
      ORDER BY artists DESC
      LIMIT ${limit}
    `;
  }

  // ── Person-to-person follows (Group Plans) ───────────────

  async followUser(followerId: string, followeeId: string) {
    if (followerId === followeeId) {
      throw new BadRequestException('You cannot follow yourself.');
    }
    await this.prisma.userFollow.createMany({
      data: { followerId, followeeId },
      skipDuplicates: true,
    });
    const mutual = await this.prisma.userFollow.findUnique({
      where: { followerId_followeeId: { followerId: followeeId, followeeId: followerId } },
    });
    return { following: true, mutual: mutual !== null };
  }

  async unfollowUser(followerId: string, followeeId: string) {
    await this.prisma.userFollow.deleteMany({ where: { followerId, followeeId } });
    return { following: false, mutual: false };
  }

  async registerPushToken(userId: string, token: string, platform: string) {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });
    return { registered: true };
  }

  async removePushToken(userId: string, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
    return { removed: true };
  }
}
