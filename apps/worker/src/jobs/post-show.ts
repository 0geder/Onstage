import { badgesForStreak, type NotificationPrefs } from '@onstage/shared';
import { logger } from '../logger';
import { prisma } from '../prisma';
import { enqueue, wantsCategory } from './outbox';

/**
 * After the show.
 *
 * Three things happen once an event is over:
 *
 *  1. Anyone who said they were going is marked as having attended. This is
 *     server-side on purpose — `attended` is what gates the live performance
 *     rating, so letting a client claim it would make the rating worthless.
 *  2. Those people get a prompt the following morning to rate the performance.
 *     The morning after, not immediately: nobody reviews a gig in the taxi home.
 *  3. Attendance streaks are recalculated and any newly earned badge awarded.
 */

/** How long after the start time a show is considered finished. */
const SHOW_LENGTH_HOURS = 6;

/** Local hour at which the rating prompt is sent. */
const PROMPT_HOUR = 10;

/**
 * How far back confirmation looks. Only shows that still have "going" rows are
 * picked up, so the window just bounds the scan; a week covers a worker outage
 * over a long weekend without revisiting the whole archive every hour.
 */
const CONFIRM_LOOKBACK_HOURS = 7 * 24;

/** Events per pass. Newest first, so a backlog never starves last night's shows. */
const CONFIRM_BATCH = 500;

export async function confirmAttendance(): Promise<number> {
  const cutoff = new Date(Date.now() - SHOW_LENGTH_HOURS * 3_600_000);
  const floor = new Date(Date.now() - CONFIRM_LOOKBACK_HOURS * 3_600_000);

  // "Going" becomes "attended". "Interested" does not — saying a show looks good
  // is not the same as having been there, and the live rating depends on that
  // distinction holding. updated_at is set by hand because raw SQL bypasses
  // Prisma's @updatedAt, and awardBadges keys on it.
  const promoted = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ event_id: string }[]>`
      WITH finished AS (
        SELECT e.id
        FROM events e
        WHERE e.starts_at < ${cutoff}
          AND e.starts_at >= ${floor}
          AND e.status NOT IN ('cancelled', 'postponed')
          AND EXISTS (SELECT 1 FROM attendances a WHERE a.event_id = e.id AND a.state = 'going')
        ORDER BY e.starts_at DESC
        LIMIT ${CONFIRM_BATCH}
      )
      UPDATE attendances a
      SET state = 'attended', updated_at = now()
      FROM finished f
      WHERE a.event_id = f.id AND a.state = 'going'
      RETURNING a.event_id
    `;
    if (rows.length === 0) return rows;

    // Recounted from the rows rather than adjusted, so any earlier drift in
    // these counters is corrected at the same time.
    const eventIds = [...new Set(rows.map((row) => row.event_id))];
    await tx.$executeRaw`
      UPDATE events e
      SET going_count = c.going, attended_count = c.attended, updated_at = now()
      FROM (
        SELECT ev.id,
               COUNT(a.*) FILTER (WHERE a.state = 'going')::int AS going,
               COUNT(a.*) FILTER (WHERE a.state = 'attended')::int AS attended
        FROM unnest(${eventIds}::uuid[]) AS ev(id)
        LEFT JOIN attendances a ON a.event_id = ev.id
        GROUP BY ev.id
      ) c
      WHERE e.id = c.id
    `;
    return rows;
  });

  if (promoted.length > 0) {
    logger.info({ promoted: promoted.length }, 'Confirmed attendance for finished shows');
  }
  return promoted.length;
}

export async function promptLiveRatings(): Promise<number> {
  // Shows that finished yesterday: recent enough to remember, far enough that
  // the prompt lands the morning after rather than during the encore.
  const from = new Date(Date.now() - 36 * 3_600_000);
  const to = new Date(Date.now() - 8 * 3_600_000);

  const attendances = await prisma.attendance.findMany({
    where: {
      state: 'attended',
      event: { startsAt: { gte: from, lte: to } },
    },
    select: {
      userId: true,
      eventId: true,
      event: {
        select: {
          id: true,
          slug: true,
          title: true,
          localTimezone: true,
          primaryArtist: { select: { id: true, name: true } },
        },
      },
      user: {
        select: {
          notificationPrefs: true,
          bannedAt: true,
          deletionRequestedAt: true,
        },
      },
    },
    take: 1000,
  });
  if (attendances.length === 0) return 0;

  // Skip anyone who has already rated — a prompt to do something already done is
  // the fastest way to teach someone to ignore notifications.
  const rated = await prisma.rating.findMany({
    where: {
      eventId: { in: attendances.map((row) => row.eventId) },
      userId: { in: attendances.map((row) => row.userId) },
    },
    select: { userId: true, eventId: true },
  });
  const ratedKeys = new Set(rated.map((row) => `${row.userId}:${row.eventId}`));

  let queued = 0;

  for (const row of attendances) {
    if (ratedKeys.has(`${row.userId}:${row.eventId}`)) continue;
    if (row.user.bannedAt || row.user.deletionRequestedAt) continue;

    const prefs = row.user.notificationPrefs as Partial<NotificationPrefs>;
    if (!wantsCategory(prefs, 'postShowRating')) continue;

    const sent = await enqueue({
      userId: row.userId,
      kind: 'post_show_rating',
      dedupeKey: `post_show:${row.userId}:${row.eventId}`,
      payload: {
        eventId: row.event.id,
        eventSlug: row.event.slug,
        artistId: row.event.primaryArtist.id,
        title: `How was ${row.event.primaryArtist.name}?`,
        body: 'Rate the live performance — it takes a second and it is the rating other fans actually use.',
      },
      scheduledAt: nextLocalHour(row.event.localTimezone, PROMPT_HOUR),
    });
    if (sent) queued += 1;
  }

  if (queued > 0) logger.info({ queued }, 'Queued live performance rating prompts');
  return queued;
}

export async function awardBadges(): Promise<number> {
  // Only people whose attendance changed recently can have crossed a threshold.
  const recent = await prisma.attendance.findMany({
    where: { state: 'attended', updatedAt: { gte: new Date(Date.now() - 48 * 3_600_000) } },
    select: { userId: true },
    distinct: ['userId'],
    take: 1000,
  });

  let awarded = 0;

  for (const { userId } of recent) {
    const months = await streakMonths(userId);
    const earned = badgesForStreak(months);
    if (earned.length === 0) continue;

    const held = await prisma.userBadge.findMany({
      where: { userId },
      select: { code: true },
    });
    const heldCodes = new Set(held.map((badge) => badge.code));
    const fresh = earned.filter((code) => !heldCodes.has(code));
    if (fresh.length === 0) continue;

    await prisma.userBadge.createMany({
      data: fresh.map((code) => ({ userId, code, streakMonths: months })),
      skipDuplicates: true,
    });
    awarded += fresh.length;
  }

  if (awarded > 0) logger.info({ awarded }, 'Awarded attendance badges');
  return awarded;
}

/** Consecutive calendar months containing at least one attended show. */
async function streakMonths(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ month: Date }[]>`
    SELECT DISTINCT date_trunc('month', e.starts_at AT TIME ZONE 'UTC') AS month
    FROM attendances a
    JOIN events e ON e.id = a.event_id
    WHERE a.user_id = ${userId}::uuid AND a.state = 'attended'
    ORDER BY month DESC
  `;
  if (rows.length === 0) return 0;

  const index = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();
  const months = rows.map((row) => index(row.month));
  const current = index(new Date());

  if (current - months[0] > 1) return 0;

  let streak = 1;
  for (let i = 1; i < months.length; i += 1) {
    if (months[i - 1] - months[i] === 1) streak += 1;
    else break;
  }
  return streak;
}

/** The next occurrence of a given local hour in a timezone, as a UTC instant. */
function nextLocalHour(timeZone: string, hour: number): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
  }).formatToParts(now);
  const localHour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;

  const hoursUntil = localHour < hour ? hour - localHour : 24 - localHour + hour;
  return new Date(now.getTime() + hoursUntil * 3_600_000);
}
