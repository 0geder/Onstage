import { Injectable } from '@nestjs/common';
import type { DiscoveryFeed, EventSummary, GeoPoint, Paginated } from '@onstage/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toEventSummary, type EventWithRelations } from '../../common/mappers';
import { decodeCursor, pageOf } from '../../common/util/cursor';
import { weekendWindow } from '../../common/util/timezone';
import type { AuthUser } from '../../common/auth/auth-user';

const DEFAULT_RADIUS_KM = 50;
const SECTION_SIZE = 10;

interface NearbyRow {
  id: string;
  starts_at: Date;
  distance_km: number;
}

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The three sections from the spec in one round trip: what is near me, what
   * the artists I follow are doing, and what is on this weekend.
   *
   * Every section degrades on its own. No location means the "near you" section
   * comes back empty rather than the whole feed failing.
   */
  async discovery(
    user: AuthUser | undefined,
    options: {
      lat?: number;
      lng?: number;
      radiusKm?: number;
      genres?: string[];
      timezone?: string;
    },
  ): Promise<DiscoveryFeed> {
    const centre = await this.resolveCentre(user, options);
    const radiusKm = options.radiusKm ?? DEFAULT_RADIUS_KM;
    const timezone = options.timezone ?? 'Africa/Johannesburg';

    const [nearYou, fromArtistsYouFollow, thisWeekend] = await Promise.all([
      centre
        ? this.nearby(centre, radiusKm, options.genres, SECTION_SIZE).then((page) => page.items)
        : Promise.resolve([]),
      user ? this.fromFollowed(user.id, options.genres, SECTION_SIZE) : Promise.resolve([]),
      this.thisWeekend(timezone, centre, radiusKm, options.genres, SECTION_SIZE),
    ]);

    return { nearYou, fromArtistsYouFollow, thisWeekend, centre, radiusKm };
  }

  /**
   * PostGIS radius search. ST_DWithin on the generated geography column uses the
   * GiST index; the distance is returned so the client can show "12 km away".
   */
  async nearby(
    centre: GeoPoint,
    radiusKm: number,
    genres: string[] | undefined,
    limit: number,
    cursor?: string,
  ): Promise<Paginated<EventSummary>> {
    const keyset = decodeCursor(cursor);
    const afterTime = keyset ? new Date(keyset.value) : null;
    const afterId = keyset?.id ?? null;
    const genreFilter = genres?.length ? genres : null;

    const rows = await this.prisma.$queryRaw<NearbyRow[]>`
      SELECT e.id,
             e.starts_at,
             (ST_Distance(
                v.geog,
                ST_SetSRID(ST_MakePoint(${centre.lng}, ${centre.lat}), 4326)::geography
              ) / 1000.0)::float8 AS distance_km
      FROM events e
      JOIN venues v ON v.id = e.venue_id
      JOIN artists a ON a.id = e.primary_artist_id
      WHERE e.starts_at >= NOW()
        AND e.status <> 'cancelled'
        AND ST_DWithin(
              v.geog,
              ST_SetSRID(ST_MakePoint(${centre.lng}, ${centre.lat}), 4326)::geography,
              ${radiusKm * 1000}
            )
        AND (${genreFilter}::text[] IS NULL OR a.genres && ${genreFilter}::text[])
        -- Row-value comparison, so events sharing a start time are never skipped.
        AND (
          ${afterTime}::timestamptz IS NULL
          OR (e.starts_at, e.id) > (${afterTime}::timestamptz, ${afterId}::uuid)
        )
      ORDER BY e.starts_at ASC, e.id ASC
      LIMIT ${limit + 1}
    `;

    const page = pageOf(rows, limit, (row) => ({
      value: row.starts_at.toISOString(),
      id: row.id,
    }));
    const events = await this.hydrate(page.items.map((row) => row.id));

    const items = page.items
      .map((row) => {
        const event = events.get(row.id);
        return event ? toEventSummary(event, row.distance_km) : null;
      })
      .filter((event): event is EventSummary => event !== null);

    return { items, nextCursor: page.nextCursor };
  }

  /** The retention driver: shows by artists this user follows, headlining or not. */
  async fromFollowed(
    userId: string,
    genres: string[] | undefined,
    limit: number,
  ): Promise<EventSummary[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        startsAt: { gte: new Date() },
        status: { not: 'cancelled' },
        OR: [
          { primaryArtist: { follows: { some: { userId } } } },
          { lineup: { some: { artist: { follows: { some: { userId } } } } } },
        ],
        ...(genres?.length ? { primaryArtist: { genres: { hasSome: genres } } } : {}),
      },
      include: { primaryArtist: true, venue: true },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => toEventSummary(row));
  }

  /** Friday through the small hours of Monday, in the viewer's own timezone. */
  async thisWeekend(
    timezone: string,
    centre: GeoPoint | null,
    radiusKm: number,
    genres: string[] | undefined,
    limit: number,
  ): Promise<EventSummary[]> {
    const { from, to } = weekendWindow(timezone);

    if (!centre) {
      const rows = await this.prisma.event.findMany({
        where: {
          startsAt: { gte: from, lte: to },
          status: { not: 'cancelled' },
          ...(genres?.length ? { primaryArtist: { genres: { hasSome: genres } } } : {}),
        },
        include: { primaryArtist: true, venue: true },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      return rows.map((row) => toEventSummary(row));
    }

    const genreFilter = genres?.length ? genres : null;
    const rows = await this.prisma.$queryRaw<NearbyRow[]>`
      SELECT e.id,
             (ST_Distance(
                v.geog,
                ST_SetSRID(ST_MakePoint(${centre.lng}, ${centre.lat}), 4326)::geography
              ) / 1000.0)::float8 AS distance_km
      FROM events e
      JOIN venues v ON v.id = e.venue_id
      JOIN artists a ON a.id = e.primary_artist_id
      WHERE e.starts_at BETWEEN ${from} AND ${to}
        AND e.status <> 'cancelled'
        AND ST_DWithin(
              v.geog,
              ST_SetSRID(ST_MakePoint(${centre.lng}, ${centre.lat}), 4326)::geography,
              ${radiusKm * 1000}
            )
        AND (${genreFilter}::text[] IS NULL OR a.genres && ${genreFilter}::text[])
      ORDER BY e.starts_at ASC, e.id ASC
      LIMIT ${limit}
    `;

    const events = await this.hydrate(rows.map((row) => row.id));
    return rows
      .map((row) => {
        const event = events.get(row.id);
        return event ? toEventSummary(event, row.distance_km) : null;
      })
      .filter((event): event is EventSummary => event !== null);
  }

  /** The user's saved home location, or null if they have not set one. */
  async homeLocation(user: AuthUser | undefined): Promise<GeoPoint | null> {
    if (!user) return null;
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { homeLat: true, homeLng: true },
    });
    if (row?.homeLat == null || row.homeLng == null) return null;
    return { lat: row.homeLat, lng: row.homeLng };
  }

  /** Explicit coordinates win; otherwise fall back to the user's saved home. */
  private async resolveCentre(
    user: AuthUser | undefined,
    options: { lat?: number; lng?: number },
  ): Promise<GeoPoint | null> {
    if (options.lat !== undefined && options.lng !== undefined) {
      return { lat: options.lat, lng: options.lng };
    }
    return this.homeLocation(user);
  }

  /** The geo queries return ids only; the rows themselves come back in one pass. */
  private async hydrate(ids: string[]): Promise<Map<string, EventWithRelations>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.event.findMany({
      where: { id: { in: ids } },
      include: { primaryArtist: true, venue: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }
}
