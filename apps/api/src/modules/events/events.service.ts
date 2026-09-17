import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AttendanceState } from '@prisma/client';
import {
  appleMapsDirections,
  boltLink,
  googleMapsDirections,
  uberLink,
  type EventDetail,
} from '@onstage/shared';
import { CacheKeys, CacheTtl } from '../../common/redis/cache-keys';
import { CacheService } from '../../common/redis/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toEventDetail, type EventDetailRow } from '../../common/mappers';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DETAIL_INCLUDE = {
  primaryArtist: true,
  venue: true,
  lineup: { include: { artist: true }, orderBy: { billingPosition: 'asc' } },
  ticketOptions: { orderBy: { priceMinor: 'asc' } },
} satisfies Prisma.EventInclude;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findOne(idOrSlug: string, viewerId?: string): Promise<EventDetail> {
    // The event body is shared by every viewer and cached; only the viewer's own
    // attendance is per-user, so it is fetched separately and merged in.
    const cacheKey = CacheKeys.event(idOrSlug);
    let base = await this.cache.get<EventDetail>(cacheKey);

    if (!base) {
      const row = (await this.prisma.event.findFirst({
        where: UUID_PATTERN.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
        include: DETAIL_INCLUDE,
      })) as EventDetailRow | null;

      if (!row) throw new NotFoundException(`No event matches "${idOrSlug}".`);
      base = toEventDetail(row, null);
      await this.cache.set(cacheKey, base, CacheTtl.event);
    }

    if (!viewerId) return { ...base, viewerAttendance: null };

    const attendance = await this.prisma.attendance.findUnique({
      where: { userId_eventId: { userId: viewerId, eventId: base.id } },
      select: { state: true },
    });
    return { ...base, viewerAttendance: attendance?.state ?? null };
  }

  /**
   * Interested / Going / Attended.
   *
   * `attended` is not something a user sets directly — it is applied after the
   * show, and it is what unlocks the live performance rating. Accepting it from
   * the client would let anyone rate a show they never went to.
   */
  async setAttendance(userId: string, eventId: string, state: AttendanceState) {
    if (state === 'attended') {
      throw new BadRequestException(
        'Attendance is confirmed after the show, not set directly.',
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, startsAt: true, status: true },
    });
    if (!event) throw new NotFoundException('Event not found.');
    if (event.status === 'cancelled') {
      throw new BadRequestException('This event has been cancelled.');
    }

    const counts = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });

      if (existing?.state === state) return this.readCounts(tx, eventId);

      await tx.attendance.upsert({
        where: { userId_eventId: { userId, eventId } },
        create: { userId, eventId, state },
        update: { state },
      });

      const data = this.counterUpdate(existing?.state ?? null, state);
      if (Object.keys(data).length > 0) {
        await tx.event.update({ where: { id: eventId }, data });
      }
      return this.readCounts(tx, eventId);
    });

    await this.cache.invalidate(CacheKeys.event(eventId));
    return { state, attendance: counts };
  }

  async clearAttendance(userId: string, eventId: string) {
    const counts = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });
      if (!existing) return this.readCounts(tx, eventId);

      await tx.attendance.delete({ where: { userId_eventId: { userId, eventId } } });
      await tx.event.update({
        where: { id: eventId },
        data: this.counterUpdate(existing.state, null),
      });
      return this.readCounts(tx, eventId);
    });

    await this.cache.invalidate(CacheKeys.event(eventId));
    return { state: null, attendance: counts };
  }

  /**
   * Everything needed to get to the door: a map pin, walking/driving directions,
   * and a ride. Onstage books nothing — these are hand-offs to the provider's own
   * app, with a web URL for when the app is not installed.
   */
  async travelOptions(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true },
    });
    if (!event) throw new NotFoundException('Event not found.');

    const { venue } = event;
    const destination = {
      lat: venue.lat,
      lng: venue.lng,
      nickname: venue.name,
      formattedAddress: venue.addressLine ?? `${venue.name}, ${venue.city}`,
    };

    return {
      venue: {
        id: venue.id,
        name: venue.name,
        addressLine: venue.addressLine,
        city: venue.city,
        lat: venue.lat,
        lng: venue.lng,
        googlePlaceId: venue.googlePlaceId,
      },
      directions: {
        google: googleMapsDirections(destination, venue.googlePlaceId ?? undefined),
        apple: appleMapsDirections(destination, venue.name),
      },
      rides: {
        // Bolt is listed first: it has the larger South African footprint, and
        // ordering here is the whole difference between a used feature and a
        // decorative one.
        bolt: boltLink(destination),
        uber: uberLink(destination, process.env.UBER_CLIENT_ID),
      },
      disclaimer:
        'Onstage does not provide transport. These links open Bolt, Uber or your maps app.',
    };
  }

  /**
   * Group Plans: who this viewer knows is going.
   *
   * Only people the viewer follows are ever named, and the response separates
   * mutuals from one-way follows. Everyone else is a count, not a list — going
   * to a show is not a public broadcast to strangers.
   */
  async groupPlans(eventId: string, viewerId: string | undefined) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { goingCount: true, interestedCount: true },
    });
    if (!event) throw new NotFoundException('Event not found.');

    if (!viewerId) {
      return {
        connectionsGoing: [],
        totalGoing: event.goingCount,
        totalInterested: event.interestedCount,
      };
    }

    const connections = await this.prisma.$queryRaw<
      {
        id: string;
        handle: string;
        display_name: string;
        avatar: string | null;
        state: string;
        mutual: boolean;
      }[]
    >`
      SELECT u.id,
             u.handle,
             u.display_name,
             u.avatar,
             a.state::text AS state,
             EXISTS (
               SELECT 1 FROM user_follows back
               WHERE back.follower_id = u.id AND back.followee_id = ${viewerId}::uuid
             ) AS mutual
      FROM user_follows f
      JOIN users u ON u.id = f.followee_id
      JOIN attendances a ON a.user_id = u.id AND a.event_id = ${eventId}::uuid
      WHERE f.follower_id = ${viewerId}::uuid
        AND a.state IN ('going', 'interested')
        AND u.banned_at IS NULL
      ORDER BY mutual DESC, u.display_name ASC
      LIMIT 50
    `;

    return {
      connectionsGoing: connections.map((row) => ({
        id: row.id,
        handle: row.handle,
        displayName: row.display_name,
        avatar: row.avatar,
        state: row.state,
        mutual: row.mutual,
      })),
      totalGoing: event.goingCount,
      totalInterested: event.interestedCount,
    };
  }

  private static readonly COUNTER_COLUMN = {
    interested: 'interestedCount',
    going: 'goingCount',
    attended: 'attendedCount',
  } as const satisfies Record<AttendanceState, keyof Prisma.EventUpdateInput>;

  /**
   * Net counter movement for a state transition. Moving from `interested` to
   * `going` decrements one column and increments the other; re-affirming the
   * same state nets to nothing and produces an empty update.
   */
  private counterUpdate(
    from: AttendanceState | null,
    to: AttendanceState | null,
  ): Prisma.EventUpdateInput {
    const deltas: Record<string, number> = {};
    if (from) deltas[EventsService.COUNTER_COLUMN[from]] = -1;
    if (to) {
      const column = EventsService.COUNTER_COLUMN[to];
      deltas[column] = (deltas[column] ?? 0) + 1;
    }

    const data: Record<string, { increment: number }> = {};
    for (const [column, delta] of Object.entries(deltas)) {
      if (delta !== 0) data[column] = { increment: delta };
    }
    return data as Prisma.EventUpdateInput;
  }

  private async readCounts(tx: Prisma.TransactionClient, eventId: string) {
    const row = await tx.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { interestedCount: true, goingCount: true, attendedCount: true },
    });
    return {
      interested: row.interestedCount,
      going: row.goingCount,
      attended: row.attendedCount,
    };
  }
}
