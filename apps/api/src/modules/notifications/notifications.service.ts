import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NotificationCategory } from '@onstage/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Transactional outbox for pushes and emails.
 *
 * Rows are written in the same transaction as the change that triggers them and
 * drained by the worker. That is what makes a notification neither lost to a
 * crash between "comment saved" and "push sent", nor sent twice when the worker
 * retries: the unique dedupe key does the deduplication in the database.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      kind: NotificationCategory;
      dedupeKey: string;
      payload: Record<string, unknown>;
      scheduledAt?: Date;
    },
  ): Promise<void> {
    try {
      await tx.notificationOutbox.create({
        data: {
          userId: input.userId,
          kind: input.kind,
          dedupeKey: input.dedupeKey.slice(0, 200),
          payload: input.payload as Prisma.InputJsonValue,
          scheduledAt: input.scheduledAt ?? new Date(),
        },
      });
    } catch (error) {
      // A duplicate key means this notification is already queued or sent.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  /** Whether the user wants this category at all. Checked before enqueueing. */
  async wants(userId: string, key: keyof typeof CATEGORY_PREF): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true, bannedAt: true, deletionRequestedAt: true },
    });
    if (!user || user.bannedAt || user.deletionRequestedAt) return false;

    const prefs = (user.notificationPrefs ?? {}) as Record<string, unknown>;
    const field = CATEGORY_PREF[key];
    // Unset means opted in: these are service notifications the user asked for
    // by following an artist or marking themselves as going.
    return prefs[field] !== false;
  }
}

const CATEGORY_PREF = {
  new_event_announced: 'newEventAnnounced',
  on_sale_reminder: 'onSaleReminder',
  price_drop: 'priceDrop',
  tickets_back: 'ticketsBack',
  weekend_digest: 'weekendDigest',
  post_show_rating: 'postShowRating',
  thread_replies: 'threadReplies',
} as const;
