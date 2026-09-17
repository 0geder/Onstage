import { DEFAULT_NOTIFICATION_PREFS, formatMoney, type NotificationPrefs } from '@onstage/shared';
import { logger } from '../logger';
import { prisma } from '../prisma';
import { enqueue, wantsCategory } from './outbox';

/**
 * On-sale reminders, price-drop alerts and the weekend digest.
 *
 * All three answer the same question — "what would a fan actually want to be
 * interrupted for" — and all three are opt-out per category, with the on-sale
 * lead time chosen by the user rather than by us.
 */

/** Interested or going: both count as "I care about this show". */
const SAVED_STATES = ['interested', 'going'] as const;

export async function queueOnSaleReminders(): Promise<number> {
  // Widest possible lead time, narrowed per user below.
  const horizon = new Date(Date.now() + 168 * 3_600_000);

  const events = await prisma.event.findMany({
    where: {
      onSaleAt: { gt: new Date(), lte: horizon },
      status: { notIn: ['cancelled', 'sold_out'] },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      onSaleAt: true,
      primaryArtist: { select: { name: true } },
      attendances: {
        where: { state: { in: [...SAVED_STATES] } },
        select: {
          userId: true,
          user: {
            select: {
              notificationPrefs: true,
              bannedAt: true,
              deletionRequestedAt: true,
            },
          },
        },
      },
    },
    take: 500,
  });

  let queued = 0;

  for (const event of events) {
    if (!event.onSaleAt) continue;

    for (const attendance of event.attendances) {
      const user = attendance.user;
      if (user.bannedAt || user.deletionRequestedAt) continue;

      const prefs = {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...((user.notificationPrefs ?? {}) as Partial<NotificationPrefs>),
      };
      if (!wantsCategory(prefs, 'onSaleReminder')) continue;

      const leadMs = prefs.onSaleLeadTimeHours * 3_600_000;
      const sendAt = new Date(event.onSaleAt.getTime() - leadMs);

      // Only queue once we are inside this user's chosen lead time. Queueing
      // earlier would pin the send time to whatever their preference was then.
      if (sendAt.getTime() > Date.now() + 3_600_000) continue;

      const sent = await enqueue({
        userId: attendance.userId,
        kind: 'on_sale_reminder',
        dedupeKey: `on_sale:${attendance.userId}:${event.id}`,
        payload: {
          eventId: event.id,
          eventSlug: event.slug,
          title: `${event.primaryArtist.name} tickets are about to drop`,
          body: `Tickets for ${event.title} go on sale soon.`,
          onSaleAt: event.onSaleAt.toISOString(),
        },
        scheduledAt: sendAt > new Date() ? sendAt : new Date(),
      });
      if (sent) queued += 1;
    }
  }

  if (queued > 0) logger.info({ queued }, 'Queued on-sale reminders');
  return queued;
}

export async function queuePriceDropAlerts(): Promise<number> {
  // A price drop is two snapshots on the same tier where the newer one is lower.
  const drops = await prisma.$queryRaw<
    {
      event_id: string;
      event_slug: string;
      title: string;
      tier_name: string;
      currency: string;
      old_price: number;
      new_price: number;
    }[]
  >`
    WITH ranked AS (
      SELECT s.ticket_option_id,
             s.price_minor,
             s.currency,
             s.observed_at,
             ROW_NUMBER() OVER (PARTITION BY s.ticket_option_id ORDER BY s.observed_at DESC) AS rn
      FROM ticket_price_snapshots s
      WHERE s.observed_at > NOW() - INTERVAL '24 hours'
    )
    SELECT e.id AS event_id,
           e.slug AS event_slug,
           e.title,
           t.tier_name,
           latest.currency,
           previous.price_minor AS old_price,
           latest.price_minor AS new_price
    FROM ranked latest
    JOIN ranked previous
      ON previous.ticket_option_id = latest.ticket_option_id AND previous.rn = 2
    JOIN ticket_options t ON t.id = latest.ticket_option_id
    JOIN events e ON e.id = t.event_id
    WHERE latest.rn = 1
      AND latest.price_minor < previous.price_minor
      AND e.starts_at > NOW()
      AND e.status <> 'cancelled'
  `;

  let queued = 0;

  for (const drop of drops) {
    const watchers = await prisma.attendance.findMany({
      where: { eventId: drop.event_id, state: { in: [...SAVED_STATES] } },
      select: {
        userId: true,
        user: { select: { notificationPrefs: true, bannedAt: true, deletionRequestedAt: true } },
      },
    });

    for (const watcher of watchers) {
      if (watcher.user.bannedAt || watcher.user.deletionRequestedAt) continue;
      const prefs = watcher.user.notificationPrefs as Partial<NotificationPrefs>;
      if (!wantsCategory(prefs, 'priceDrop')) continue;

      const sent = await enqueue({
        userId: watcher.userId,
        kind: 'price_drop',
        // Keyed on the new price, so a further drop is a new notification but a
        // re-run over the same drop is not.
        dedupeKey: `price_drop:${watcher.userId}:${drop.event_id}:${drop.tier_name}:${drop.new_price}`,
        payload: {
          eventId: drop.event_id,
          eventSlug: drop.event_slug,
          title: `${drop.tier_name} tickets just got cheaper`,
          body:
            `${drop.title}: ${formatMoney(drop.old_price, drop.currency)} → ` +
            `${formatMoney(drop.new_price, drop.currency)}`,
        },
      });
      if (sent) queued += 1;
    }
  }

  if (queued > 0) logger.info({ queued }, 'Queued price-drop alerts');
  return queued;
}

/**
 * Weekly "shows near you this weekend" digest.
 *
 * Sent once a week, to people who have a home location and want it. Users with
 * nothing near them get nothing — an empty digest is worse than no digest.
 */
export async function queueWeekendDigest(): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      homeLat: { not: null },
      homeLng: { not: null },
      bannedAt: null,
      deletionRequestedAt: null,
    },
    select: { id: true, homeLat: true, homeLng: true, notificationPrefs: true },
    take: 5000,
  });

  const weekStamp = new Date().toISOString().slice(0, 10);
  let queued = 0;

  for (const user of users) {
    const prefs = user.notificationPrefs as Partial<NotificationPrefs>;
    if (!wantsCategory(prefs, 'weekendDigest')) continue;

    const nearby = await prisma.$queryRaw<{ id: string; title: string }[]>`
      SELECT e.id, e.title
      FROM events e
      JOIN venues v ON v.id = e.venue_id
      WHERE e.starts_at BETWEEN NOW() AND NOW() + INTERVAL '5 days'
        AND e.status <> 'cancelled'
        AND ST_DWithin(
              v.geog,
              ST_SetSRID(ST_MakePoint(${user.homeLng}, ${user.homeLat}), 4326)::geography,
              50000
            )
      ORDER BY e.starts_at ASC
      LIMIT 5
    `;
    if (nearby.length === 0) continue;

    const sent = await enqueue({
      userId: user.id,
      kind: 'weekend_digest',
      dedupeKey: `weekend:${user.id}:${weekStamp}`,
      payload: {
        title: `${nearby.length} show${nearby.length === 1 ? '' : 's'} near you this weekend`,
        body: nearby.map((event) => event.title).join(' · '),
        eventIds: nearby.map((event) => event.id),
      },
    });
    if (sent) queued += 1;
  }

  if (queued > 0) logger.info({ queued }, 'Queued weekend digests');
  return queued;
}
