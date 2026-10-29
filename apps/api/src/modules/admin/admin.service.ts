import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normaliseName, slugify } from '@onstage/shared';
import { CacheKeys } from '../../common/redis/cache-keys';
import { CacheService } from '../../common/redis/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  CreateArtistDto,
  CreateEventDto,
  CreateVenueDto,
  SetLineupDto,
  SetTicketOptionsDto,
  UpdateArtistDto,
  UpdateEventDto,
  UpdateVenueDto,
} from './dto/admin.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The manual curation surface.
 *
 * Aggregator APIs barely touch the South African local scene, so this is not a
 * back-office nicety — it is where a launch city's coverage actually comes from.
 * Everything created here is written with source `manual` and locked, which is
 * what stops an ingestion run from overwriting a curator's work.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // ── Artists ──────────────────────────────────────────────

  async createArtist(input: CreateArtistDto) {
    const slug = await this.uniqueSlug('artist', input.slug ?? slugify(input.name));

    return this.prisma.artist.create({
      data: {
        name: input.name,
        slug,
        verified: input.verified ?? false,
        bio: input.bio ?? null,
        genres: input.genres ?? [],
        homeCity: input.homeCity ?? null,
        country: input.country ?? null,
        profileImage: input.profileImage ?? null,
        bannerImage: input.bannerImage ?? null,
        streamingLinks: (input.streamingLinks ?? {}) as Prisma.InputJsonValue,
        socialLinks: (input.socialLinks ?? {}) as Prisma.InputJsonValue,
        externalIds: (input.externalIds ?? {}) as Prisma.InputJsonValue,
        aliases: {
          create: (input.aliases ?? []).map((alias) => ({
            alias,
            normalisedAlias: normaliseName(alias),
          })),
        },
      },
      include: { aliases: true },
    });
  }

  async updateArtist(id: string, input: UpdateArtistDto) {
    await this.mustExist('artist', id);

    const data: Prisma.ArtistUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.verified !== undefined) data.verified = input.verified;
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.genres !== undefined) data.genres = input.genres;
    if (input.homeCity !== undefined) data.homeCity = input.homeCity;
    if (input.country !== undefined) data.country = input.country;
    if (input.profileImage !== undefined) data.profileImage = input.profileImage;
    if (input.bannerImage !== undefined) data.bannerImage = input.bannerImage;
    if (input.streamingLinks !== undefined) {
      data.streamingLinks = input.streamingLinks as Prisma.InputJsonValue;
    }
    if (input.socialLinks !== undefined) {
      data.socialLinks = input.socialLinks as Prisma.InputJsonValue;
    }
    if (input.externalIds !== undefined) {
      data.externalIds = input.externalIds as Prisma.InputJsonValue;
    }

    const artist = await this.prisma.artist.update({ where: { id }, data });

    if (input.aliases) {
      await this.prisma.$transaction([
        this.prisma.artistAlias.deleteMany({ where: { artistId: id } }),
        this.prisma.artistAlias.createMany({
          data: input.aliases.map((alias) => ({
            artistId: id,
            alias,
            normalisedAlias: normaliseName(alias),
          })),
          skipDuplicates: true,
        }),
      ]);
    }

    await this.cache.invalidate(CacheKeys.artist(id), CacheKeys.artist(artist.slug));
    return artist;
  }

  // ── Venues ───────────────────────────────────────────────

  async createVenue(input: CreateVenueDto) {
    const slug = await this.uniqueSlug('venue', slugify(`${input.name}-${input.city}`));
    return this.prisma.venue.create({
      data: {
        name: input.name,
        slug,
        addressLine: input.addressLine ?? null,
        city: input.city,
        country: input.country,
        lat: input.lat,
        lng: input.lng,
        capacity: input.capacity ?? null,
        googlePlaceId: input.googlePlaceId ?? null,
        image: input.image ?? null,
        website: input.website ?? null,
        timezone: input.timezone ?? 'Africa/Johannesburg',
        wheelchairAccess: input.wheelchairAccess ?? null,
        ageRestriction: input.ageRestriction ?? null,
        reentryPolicy: input.reentryPolicy ?? null,
        cloakroom: input.cloakroom ?? null,
      },
    });
  }

  async updateVenue(id: string, input: UpdateVenueDto) {
    await this.mustExist('venue', id);
    return this.prisma.venue.update({ where: { id }, data: input });
  }

  async listVenues(search: string | undefined, limit: number) {
    return this.prisma.venue.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      take: limit,
    });
  }

  // ── Events ───────────────────────────────────────────────

  async createEvent(input: CreateEventDto) {
    const venue = await this.prisma.venue.findUnique({ where: { id: input.venueId } });
    if (!venue) throw new NotFoundException('Venue not found.');
    await this.mustExist('artist', input.primaryArtistId);

    const slug = await this.uniqueSlug(
      'event',
      slugify(`${input.title}-${venue.city}-${input.startsAt.slice(0, 10)}`),
    );

    const event = await this.prisma.event.create({
      data: {
        title: input.title,
        slug,
        primaryArtistId: input.primaryArtistId,
        venueId: input.venueId,
        startsAt: new Date(input.startsAt),
        localTimezone: input.localTimezone ?? venue.timezone,
        doorsOpenAt: input.doorsOpenAt ? new Date(input.doorsOpenAt) : null,
        onSaleAt: input.onSaleAt ? new Date(input.onSaleAt) : null,
        status: input.status ?? 'announced',
        ageRestriction: input.ageRestriction ?? null,
        description: input.description ?? null,
        posterImage: input.posterImage ?? null,
        source: input.source ?? 'manual',
        sourceUrl: input.sourceUrl ?? null,
        // Curated rows are locked by default; ingestion skips locked events.
        isLocked: input.isLocked ?? true,
        lineup: {
          create: (input.lineup ?? []).map((entry, index) => ({
            artistId: entry.artistId,
            billingPosition: entry.billingPosition ?? index,
            role: entry.role ?? (index === 0 ? 'headliner' : 'support'),
          })),
        },
      },
      include: { lineup: { include: { artist: true } }, venue: true, primaryArtist: true },
    });

    await this.cache.invalidate(CacheKeys.artist(input.primaryArtistId));
    return event;
  }

  async updateEvent(id: string, input: UpdateEventDto) {
    const existing = await this.prisma.event.findUnique({ where: { id }, select: { slug: true } });
    if (!existing) throw new NotFoundException('Event not found.');

    const data: Prisma.EventUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.doorsOpenAt !== undefined) {
      data.doorsOpenAt = input.doorsOpenAt ? new Date(input.doorsOpenAt) : null;
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.ageRestriction !== undefined) data.ageRestriction = input.ageRestriction;
    if (input.description !== undefined) data.description = input.description;
    if (input.posterImage !== undefined) data.posterImage = input.posterImage;
    if (input.localTimezone !== undefined) data.localTimezone = input.localTimezone;
    if (input.isLocked !== undefined) data.isLocked = input.isLocked;
    if (input.onSaleAt !== undefined) {
      data.onSaleAt = input.onSaleAt ? new Date(input.onSaleAt) : null;
    }
    if (input.venueId !== undefined) data.venue = { connect: { id: input.venueId } };
    if (input.primaryArtistId !== undefined) {
      data.primaryArtist = { connect: { id: input.primaryArtistId } };
    }

    const event = await this.prisma.event.update({ where: { id }, data });
    await this.cache.invalidate(CacheKeys.event(id), CacheKeys.event(existing.slug));
    return event;
  }

  async deleteEvent(id: string) {
    const existing = await this.prisma.event.findUnique({ where: { id }, select: { slug: true } });
    if (!existing) throw new NotFoundException('Event not found.');
    await this.prisma.event.delete({ where: { id } });
    await this.cache.invalidate(CacheKeys.event(id), CacheKeys.event(existing.slug));
    return { deleted: true };
  }

  /** Replaces the whole lineup, so billing order is always explicit. */
  async setLineup(eventId: string, input: SetLineupDto) {
    await this.mustExist('event', eventId);

    const positions = input.entries.map((entry, index) => entry.billingPosition ?? index);
    if (new Set(positions).size !== positions.length) {
      throw new BadRequestException('Billing positions must be unique.');
    }

    await this.prisma.$transaction([
      this.prisma.eventLineup.deleteMany({ where: { eventId } }),
      this.prisma.eventLineup.createMany({
        data: input.entries.map((entry, index) => ({
          eventId,
          artistId: entry.artistId,
          billingPosition: entry.billingPosition ?? index,
          role: entry.role ?? (index === 0 ? 'headliner' : 'support'),
        })),
      }),
    ]);

    await this.cache.invalidate(CacheKeys.event(eventId));
    return this.prisma.eventLineup.findMany({
      where: { eventId },
      include: { artist: true },
      orderBy: { billingPosition: 'asc' },
    });
  }

  async setTicketOptions(eventId: string, input: SetTicketOptionsDto) {
    await this.mustExist('event', eventId);

    await this.prisma.$transaction([
      this.prisma.ticketOption.deleteMany({ where: { eventId } }),
      this.prisma.ticketOption.createMany({
        data: input.options.map((option) => ({
          eventId,
          provider: option.provider,
          tierName: option.tierName,
          priceMinor: option.priceMinor ?? null,
          currency: option.currency ?? 'ZAR',
          availability: option.availability ?? 'available',
          purchaseUrl: option.purchaseUrl,
          lastCheckedAt: new Date(),
        })),
      }),
    ]);

    await this.cache.invalidate(CacheKeys.event(eventId));
    return this.prisma.ticketOption.findMany({
      where: { eventId },
      orderBy: { priceMinor: 'asc' },
    });
  }

  async listEvents(options: { search?: string; city?: string; limit: number; upcoming: boolean }) {
    return this.prisma.event.findMany({
      where: {
        ...(options.upcoming ? { startsAt: { gte: new Date() } } : {}),
        ...(options.search
          ? {
              OR: [
                { title: { contains: options.search, mode: 'insensitive' } },
                { primaryArtist: { name: { contains: options.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
        ...(options.city ? { venue: { city: { equals: options.city, mode: 'insensitive' } } } : {}),
      },
      include: { primaryArtist: true, venue: true, ticketOptions: true },
      orderBy: { startsAt: options.upcoming ? 'asc' : 'desc' },
      take: options.limit,
    });
  }

  // ── Moderation ───────────────────────────────────────────

  /** Reported and auto-flagged comments, worst first. */
  async moderationQueue(limit: number) {
    const comments = await this.prisma.comment.findMany({
      where: {
        deletedAt: null,
        OR: [{ moderationState: { in: ['flagged', 'hidden'] } }, { reports: { some: { status: 'open' } } }],
      },
      include: {
        user: { select: { id: true, handle: true, displayName: true, createdAt: true } },
        event: { select: { id: true, title: true, slug: true } },
        reports: { where: { status: 'open' }, select: { reason: true, detail: true } },
      },
      orderBy: [{ scamScore: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      tag: comment.tag,
      scamScore: comment.scamScore,
      scamSignals: comment.scamSignals,
      moderationState: comment.moderationState,
      isHidden: comment.isHidden,
      createdAt: comment.createdAt.toISOString(),
      author: comment.user,
      event: comment.event,
      openReports: comment.reports,
    }));
  }

  /**
   * Resolves the moderator named by the CMS. Absent means "the CMS itself" and
   * is recorded as null; present but not an admin user is refused outright.
   */
  async resolveModerator(adminUserId: string | undefined): Promise<string | null> {
    if (adminUserId === undefined || adminUserId === '') return null;
    if (!UUID.test(adminUserId)) {
      throw new ForbiddenException('X-Admin-User-Id must be the id of an admin user.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { isAdmin: true, bannedAt: true },
    });
    if (!user?.isAdmin || user.bannedAt) {
      throw new ForbiddenException('X-Admin-User-Id must be the id of an admin user.');
    }
    return adminUserId;
  }

  async moderateComment(
    commentId: string,
    action: 'hide' | 'restore',
    moderatorId: string | null,
    resolution?: string,
  ) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, eventId: true },
    });
    if (!comment) throw new NotFoundException('Comment not found.');

    await this.prisma.$transaction([
      this.prisma.comment.update({
        where: { id: commentId },
        data:
          action === 'hide'
            ? { isHidden: true, moderationState: 'hidden' }
            : { isHidden: false, moderationState: 'visible' },
      }),
      this.prisma.commentReport.updateMany({
        where: { commentId, status: 'open' },
        data: {
          status: action === 'hide' ? 'actioned' : 'dismissed',
          moderatorId,
          resolution: resolution ?? null,
          resolvedAt: new Date(),
        },
      }),
    ]);

    await this.cache.invalidate(CacheKeys.event(comment.eventId));
    return { moderated: true, action };
  }

  /** Bans an account. Every write path checks `bannedAt` before proceeding. */
  async banUser(userId: string, reason: string, moderatorId: string | null = null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: new Date(), banReason: reason },
    });
    // Their existing posts go with them.
    await this.prisma.comment.updateMany({
      where: { userId, deletedAt: null },
      data: { isHidden: true, moderationState: 'hidden' },
    });
    // No ban-audit column yet, so the acting moderator goes to the log.
    this.logger.log(`User ${userId} banned by ${moderatorId ?? 'admin token'}`);
    return { banned: true };
  }

  async unbanUser(userId: string, moderatorId: string | null = null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: null, banReason: null },
    });
    this.logger.log(`User ${userId} unbanned by ${moderatorId ?? 'admin token'}`);
    return { banned: false };
  }

  // ── Operational visibility ───────────────────────────────

  async ingestionRuns(limit: number) {
    return this.prisma.ingestionRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
  }

  /**
   * Coverage report: how many upcoming events each city has, and how many came
   * from a human rather than a feed. A city sitting near zero manual entries is
   * a city we have not actually launched.
   */
  async coverage() {
    return this.prisma.$queryRaw<
      { city: string; country: string; upcoming: number; manual: number; sources: string[] }[]
    >`
      SELECT v.city,
             v.country,
             COUNT(*)::int AS upcoming,
             COUNT(*) FILTER (WHERE e.source IN ('manual', 'artist_submitted'))::int AS manual,
             ARRAY_AGG(DISTINCT e.source::text) AS sources
      FROM events e
      JOIN venues v ON v.id = e.venue_id
      WHERE e.starts_at >= NOW()
      GROUP BY v.city, v.country
      ORDER BY upcoming DESC
    `;
  }

  /** Artists taking an unusual volume of ratings in a short window. */
  async ratingAnomalies(hours = 24, threshold = 25) {
    return this.prisma.$queryRaw<
      { artist_id: string; name: string; ratings: number; new_accounts: number }[]
    >`
      SELECT a.id AS artist_id,
             a.name,
             COUNT(*)::int AS ratings,
             COUNT(*) FILTER (WHERE u.created_at > NOW() - INTERVAL '7 days')::int AS new_accounts
      FROM ratings r
      JOIN artists a ON a.id = r.artist_id
      JOIN users u ON u.id = r.user_id
      WHERE r.created_at > NOW() - (${hours} * INTERVAL '1 hour')
      GROUP BY a.id, a.name
      HAVING COUNT(*) >= ${threshold}
      ORDER BY ratings DESC
    `;
  }

  /**
   * Paid placement. Sets the flag and an optional end date; expiry is evaluated
   * on read, so a lapsed campaign stops showing without a sweep job.
   */
  async setPromotion(
    model: 'artist' | 'event',
    id: string,
    isPromoted: boolean,
    promotedUntil?: string,
  ) {
    const data = {
      isPromoted,
      promotedUntil: isPromoted && promotedUntil ? new Date(promotedUntil) : null,
    };

    if (model === 'artist') {
      const artist = await this.prisma.artist.update({ where: { id }, data });
      await this.cache.invalidate(CacheKeys.artist(id), CacheKeys.artist(artist.slug));
      return artist;
    }

    const event = await this.prisma.event.update({ where: { id }, data });
    await this.cache.invalidate(CacheKeys.event(id), CacheKeys.event(event.slug));
    return event;
  }

  /** POPIA deletion requests awaiting action, oldest first. */
  async pendingDeletionRequests() {
    const rows = await this.prisma.user.findMany({
      where: { deletionRequestedAt: { not: null } },
      select: {
        id: true,
        handle: true,
        email: true,
        deletionRequestedAt: true,
      },
      orderBy: { deletionRequestedAt: 'asc' },
    });

    return rows.map((row) => ({
      ...row,
      // Surfaced so the queue is triaged by deadline, not by feel.
      dueAt: new Date(
        (row.deletionRequestedAt as Date).getTime() + 30 * 86_400_000,
      ).toISOString(),
    }));
  }

  // ── Helpers ──────────────────────────────────────────────

  private async mustExist(model: 'artist' | 'venue' | 'event', id: string): Promise<void> {
    const found =
      model === 'artist'
        ? await this.prisma.artist.findUnique({ where: { id }, select: { id: true } })
        : model === 'venue'
          ? await this.prisma.venue.findUnique({ where: { id }, select: { id: true } })
          : await this.prisma.event.findUnique({ where: { id }, select: { id: true } });

    if (!found) throw new NotFoundException(`${model} not found.`);
  }

  private async uniqueSlug(
    model: 'artist' | 'venue' | 'event',
    candidate: string,
  ): Promise<string> {
    const base = candidate || 'entry';
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken =
        model === 'artist'
          ? await this.prisma.artist.findUnique({ where: { slug }, select: { id: true } })
          : model === 'venue'
            ? await this.prisma.venue.findUnique({ where: { slug }, select: { id: true } })
            : await this.prisma.event.findUnique({ where: { slug }, select: { id: true } });
      if (!taken) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
