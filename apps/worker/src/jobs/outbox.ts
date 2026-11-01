import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '@onstage/shared';
import { Prisma } from '@prisma/client';
import { logger } from '../logger';
import { prisma } from '../prisma';

/**
 * The notification outbox.
 *
 * Producers write rows; this drains them. The unique dedupe key is what stops a
 * retry from double-sending, so delivery can be retried freely without anyone
 * getting the same push twice.
 */

export interface OutboxEntry {
  userId: string;
  kind: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  scheduledAt?: Date;
}

/** Returns false when this notification was already queued or sent. */
export async function enqueue(entry: OutboxEntry): Promise<boolean> {
  try {
    await prisma.notificationOutbox.create({
      data: {
        userId: entry.userId,
        kind: entry.kind,
        dedupeKey: entry.dedupeKey.slice(0, 200),
        payload: entry.payload as Prisma.InputJsonValue,
        scheduledAt: entry.scheduledAt ?? new Date(),
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

/**
 * Preference check.
 *
 * An unset key means opted in, because every category here is something the user
 * asked for by following an artist or saying they are going. Withdrawn push
 * consent is handled earlier, by deleting the device tokens outright.
 */
export function wantsCategory(
  prefs: Partial<NotificationPrefs> | null | undefined,
  key: keyof NotificationPrefs,
): boolean {
  const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...(prefs ?? {}) };
  return merged[key] !== false;
}

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 200;
/** Pushes in flight at once. Each is one HTTP call to Expo with a 15 s timeout. */
const SEND_CONCURRENCY = 8;
/**
 * How long a claimed row stays invisible to other drains. Must comfortably
 * exceed a full batch (200 rows / 8 at a time × 15 s worst case ≈ 6 min). A
 * drain that dies mid-batch leaves its rows to reappear after this — delivery
 * is at-least-once across a crash, exactly-once otherwise.
 */
const CLAIM_LEASE_MINUTES = 15;

/**
 * Atomically claims a batch of due rows.
 *
 * The outbox status enum has no "sending" state, so the claim is a lease: the
 * claimed rows' scheduled_at is pushed past the lease, which takes them out of
 * every other drain's "due" set the moment this statement commits. SKIP LOCKED
 * means two drains racing on the same rows split them instead of both taking them.
 */
async function claimDue(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE notification_outbox
    SET scheduled_at = now() + make_interval(mins => ${CLAIM_LEASE_MINUTES}::int)
    WHERE id IN (
      SELECT id FROM notification_outbox
      WHERE status = 'pending' AND scheduled_at <= now() AND attempts < ${MAX_ATTEMPTS}
      ORDER BY scheduled_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  return rows.map((row) => row.id);
}

/** Runs `task` over `items` with at most `limit` in flight. */
async function forEachConcurrent<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  });
  await Promise.all(lanes);
}

/**
 * Delivers due notifications.
 *
 * Push delivery itself is deliberately behind a seam: with PUSH_DELIVERY unset
 * the worker logs what it would have sent and marks the row sent, so the whole
 * pipeline is exercisable in development without an Expo project.
 */
export async function drainOutbox(): Promise<{ sent: number; failed: number }> {
  const claimed = await claimDue();
  if (claimed.length === 0) return { sent: 0, failed: 0 };

  const due = await prisma.notificationOutbox.findMany({
    where: { id: { in: claimed } },
    orderBy: { scheduledAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          handle: true,
          locale: true,
          bannedAt: true,
          deletionRequestedAt: true,
          pushTokens: { select: { token: true, platform: true } },
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;

  await forEachConcurrent(due, SEND_CONCURRENCY, async (row) => {
    // A ban or deletion request between queueing and sending cancels delivery.
    if (row.user.bannedAt || row.user.deletionRequestedAt) {
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: 'failed', lastError: 'Recipient is banned or pending deletion' },
      });
      failed += 1;
      return;
    }

    try {
      await deliver(row.kind, row.payload as Record<string, unknown>, row.user);
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: 'sent', sentAt: new Date(), attempts: { increment: 1 } },
      });
      sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          // Give up only after the retry budget is spent.
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          lastError: (error as Error).message.slice(0, 500),
          scheduledAt: new Date(Date.now() + 2 ** attempts * 60_000),
        },
      });
      failed += 1;
    }
  });

  if (sent || failed) logger.info({ sent, failed }, 'Outbox drained');
  return { sent, failed };
}

interface Recipient {
  id: string;
  handle: string;
  locale: string;
  pushTokens: { token: string; platform: string }[];
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Where a tap on the notification should land in the app. */
function deepLinkPath(kind: string, payload: Record<string, unknown>): string {
  if (kind === 'post_show_rating') return '/plans';
  if (typeof payload.eventSlug === 'string') return `/event/${payload.eventSlug}`;
  if (typeof payload.artistSlug === 'string') return `/artist/${payload.artistSlug}`;
  return '/';
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Push delivery through the Expo push service, which fronts both APNs and FCM
 * for tokens the mobile app registers with expo-notifications. Kept as a single
 * seam so swapping providers does not touch any producer.
 */
async function deliver(
  kind: string,
  payload: Record<string, unknown>,
  user: Recipient,
): Promise<void> {
  if (process.env.PUSH_DELIVERY !== 'expo') {
    logger.info(
      { kind, to: user.handle, title: payload.title, devices: user.pushTokens.length },
      'Push delivery disabled — notification logged instead of sent',
    );
    return;
  }

  const tokens = user.pushTokens.map((device) => device.token);
  if (tokens.length === 0) {
    // Nothing to deliver to is a completed delivery, not a failure to retry.
    logger.debug({ kind, to: user.handle }, 'No registered devices');
    return;
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  // Optional: required only once "enhanced push security" is on for the Expo project.
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  const messages = tokens.map((to) => ({
    to,
    title: String(payload.title ?? 'Onstage'),
    body: typeof payload.body === 'string' ? payload.body : undefined,
    sound: 'default',
    channelId: 'default',
    data: { kind, url: deepLinkPath(kind, payload) },
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Expo push service returned ${response.status}`);
  }

  const { data: tickets } = (await response.json()) as { data: ExpoTicket[] };

  // Uninstalled apps report DeviceNotRegistered; drop those tokens so they are
  // not retried forever.
  const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
  if (dead.length) {
    await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
    logger.info({ to: user.handle, removed: dead.length }, 'Removed unregistered push tokens');
  }

  const delivered = tickets.filter((ticket) => ticket.status === 'ok').length;
  if (delivered === 0 && dead.length < tokens.length) {
    const reason = tickets.find((ticket) => ticket.status === 'error')?.message ?? 'unknown error';
    throw new Error(`No device accepted the push: ${reason}`);
  }
}
