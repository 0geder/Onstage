import { haversineKm, type NotificationPrefs } from '@onstage/shared';
import { logger } from '../logger';
import { prisma } from '../prisma';
import { enqueue, wantsCategory } from './outbox';

/**
 * "An artist you follow announced a show."
 *
 * Regionality is the point. A Cape Town fan following an international act does
 * not want a push for a show in Manchester, so the fan-out is filtered by the
 * distance between the user's home and the venue. A user with no saved home
 * location gets nothing here rather than getting everything — an irrelevant push
 * is how notification permission gets revoked.
 */

/** Maximum distance from home for an announcement to be worth sending. */
const REGION_RADIUS_KM = 250;

export async function enqueueNewEventAnnouncements(eventIds: string[]): Promise<number> {
  if (eventIds.length === 0) return 0;

  let queued = 0;

  for (const eventId of eventIds) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: { select: { lat: true, lng: true, city: true, name: true } },
        primaryArtist: { select: { id: true, name: true, slug: true } },
        lineup: { select: { artistId: true } },
      },
    });
    if (!event || event.status === 'cancelled' || event.startsAt < new Date()) continue;

    // Everyone following anyone on the bill, headliner or support.
    const artistIds = [event.primaryArtistId, ...event.lineup.map((entry) => entry.artistId)];
    const followers = await prisma.follow.findMany({
      where: { artistId: { in: artistIds } },
      select: {
        userId: true,
        user: {
          select: {
            homeLat: true,
            homeLng: true,
            notificationPrefs: true,
            bannedAt: true,
            deletionRequestedAt: true,
          },
        },
      },
      distinct: ['userId'],
    });

    for (const follow of followers) {
      const user = follow.user;
      if (user.bannedAt || user.deletionRequestedAt) continue;
      if (user.homeLat === null || user.homeLng === null) continue;

      const distanceKm = haversineKm(
        { lat: user.homeLat, lng: user.homeLng },
        { lat: event.venue.lat, lng: event.venue.lng },
      );
      if (distanceKm > REGION_RADIUS_KM) continue;

      const prefs = user.notificationPrefs as Partial<NotificationPrefs>;
      if (!wantsCategory(prefs, 'newEventAnnounced')) continue;

      const sent = await enqueue({
        userId: follow.userId,
        kind: 'new_event_announced',
        // One announcement per user per event, however many followed acts are on it.
        dedupeKey: `new_event:${follow.userId}:${event.id}`,
        payload: {
          eventId: event.id,
          eventSlug: event.slug,
          title: `${event.primaryArtist.name} in ${event.venue.city}`,
          body: `${event.primaryArtist.name} is playing ${event.venue.name}. Tickets and details on Onstage.`,
          artistSlug: event.primaryArtist.slug,
          distanceKm: Math.round(distanceKm),
        },
      });
      if (sent) queued += 1;
    }
  }

  if (queued > 0) logger.info({ queued, events: eventIds.length }, 'Queued event announcements');
  return queued;
}
