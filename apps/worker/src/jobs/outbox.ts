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

/**
 * Delivers due notifications.
 *
 * Push delivery itself is deliberately behind a seam: with no FCM key configured
 * the worker logs what it would have sent and marks the row sent, so the whole
 * pipeline is exercisable in development without a Firebase project.
 */
export async function drainOutbox(): Promise<{ sent: number; failed: number }> {
  const due = await prisma.notificationOutbox.findMany({
    where: { status: 'pending', scheduledAt: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { scheduledAt: 'asc' },
    take: BATCH_SIZE,
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

  for (const row of due) {
    // A ban or deletion request between queueing and sending cancels delivery.
    if (row.user.bannedAt || row.user.deletionRequestedAt) {
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: 'failed', lastError: 'Recipient is banned or pending deletion' },
      });
      failed += 1;
      continue;
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
  }

  if (sent || failed) logger.info({ sent, failed }, 'Outbox drained');
  return { sent, failed };
}

interface Recipient {
  id: string;
  handle: string;
  locale: string;
  pushTokens: { token: string; platform: string }[];
}

async function deliver(
  kind: string,
  payload: Record<string, unknown>,
  user: Recipient,
): Promise<void> {
  const serverKey = process.env.FCM_SERVER_KEY;

  if (!serverKey) {
    logger.info(
      { kind, to: user.handle, title: payload.title, devices: user.pushTokens.length },
      'FCM not configured — notification logged instead of sent',
    );
    return;
  }

  if (user.pushTokens.length === 0) {
    // Nothing to deliver to is a completed delivery, not a failure to retry.
    logger.debug({ kind, to: user.handle }, 'No registered devices');
    return;
  }

  // Real delivery goes here. Kept as a single seam so swapping FCM for another
  // provider does not touch any producer.
  throw new Error('FCM delivery is configured but not yet implemented');
}
