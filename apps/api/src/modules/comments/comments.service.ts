import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type CommentTag, type CommentThread } from '@prisma/client';
import {
  AUTO_HIDE_THRESHOLD,
  REVIEW_THRESHOLD,
  RESALE_WARNING_COPY,
  scoreComment,
  type CommentSort,
  type ThreadComment,
} from '@onstage/shared';
import { CacheKeys } from '../../common/redis/cache-keys';
import { CacheService } from '../../common/redis/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decodeCursor, pageOf } from '../../common/util/cursor';
import { toThreadComment, type CommentWithAuthor } from '../../common/mappers';
import type { AuthUser } from '../../common/auth/auth-user';

/** Posting limits. Deliberately tight: the resale tags attract bulk spam. */
const RATE_LIMITS = {
  perMinute: { max: 4, windowSeconds: 60 },
  perHour: { max: 30, windowSeconds: 3600 },
};

/** Replies shown inline under a top-level comment before "view more replies". */
const REPLY_PREVIEW = 3;

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * A page of top-level comments, each with a preview of its replies.
   *
   * The warning banner ships with every response rather than living only in the
   * client, so any surface that renders this thread carries it too.
   */
  async thread(
    eventId: string,
    options: {
      tag?: CommentTag;
      sort: CommentSort;
      limit: number;
      cursor?: string;
      thread: CommentThread;
    },
    viewer?: AuthUser,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, startsAt: true },
    });
    if (!event) throw new NotFoundException('Event not found.');

    const recapUnlocked = event.startsAt <= new Date();
    if (options.thread === 'recap' && !recapUnlocked) {
      // Not an error: the client renders a locked state with the unlock time.
      return {
        items: [],
        nextCursor: null,
        notice: RESALE_WARNING_COPY,
        thread: 'recap' as const,
        locked: true,
        unlocksAt: event.startsAt.toISOString(),
      };
    }

    const keyset = decodeCursor(options.cursor, options.sort === 'top' ? 'number' : 'date');
    const where: Prisma.CommentWhereInput = {
      eventId,
      thread: options.thread,
      parentCommentId: null,
      deletedAt: null,
      moderationState: { not: 'hidden' },
      ...(options.tag && options.tag !== 'none' ? { tag: options.tag } : {}),
    };

    if (keyset) {
      where.AND =
        options.sort === 'top'
          ? [
              {
                OR: [
                  { likeCount: { lt: Number(keyset.value) } },
                  { likeCount: Number(keyset.value), id: { gt: keyset.id } },
                ],
              },
            ]
          : [
              {
                OR: [
                  { createdAt: { lt: new Date(keyset.value) } },
                  { createdAt: new Date(keyset.value), id: { gt: keyset.id } },
                ],
              },
            ];
    }

    const rows = await this.prisma.comment.findMany({
      where,
      include: { user: true },
      orderBy:
        options.sort === 'top'
          ? [{ likeCount: 'desc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'asc' }],
      take: options.limit + 1,
    });

    const page = pageOf(rows, options.limit, (row) => ({
      value: options.sort === 'top' ? row.likeCount : row.createdAt.toISOString(),
      id: row.id,
    }));

    const replies = await this.replyPreviews(page.items.map((row) => row.id));
    const replyRows = [...replies.values()].flat();
    const liked = await this.likedIds(
      viewer?.id,
      [...page.items, ...replyRows].map((row) => row.id),
    );

    const items: ThreadComment[] = page.items.map((row) =>
      toThreadComment(
        row,
        liked.has(row.id),
        (replies.get(row.id) ?? []).map((reply) => toThreadComment(reply, liked.has(reply.id))),
      ),
    );

    return {
      items,
      nextCursor: page.nextCursor,
      // Non-dismissible on the client. Onstage is not a party to any sale.
      notice: RESALE_WARNING_COPY,
      thread: options.thread,
      locked: false,
      unlocksAt: recapUnlocked ? null : event.startsAt.toISOString(),
    };
  }

  async replies(parentId: string, limit: number, cursor: string | undefined, viewer?: AuthUser) {
    const keyset = decodeCursor(cursor);
    const rows = await this.prisma.comment.findMany({
      where: {
        parentCommentId: parentId,
        deletedAt: null,
        moderationState: { not: 'hidden' },
        ...(keyset
          ? {
              OR: [
                { createdAt: { gt: new Date(keyset.value) } },
                { createdAt: new Date(keyset.value), id: { gt: keyset.id } },
              ],
            }
          : {}),
      },
      include: { user: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const page = pageOf(rows, limit, (row) => ({
      value: row.createdAt.toISOString(),
      id: row.id,
    }));
    const liked = await this.likedIds(
      viewer?.id,
      page.items.map((row) => row.id),
    );

    return {
      items: page.items.map((row) => toThreadComment(row, liked.has(row.id))),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Post a comment or a reply.
   *
   * Every post is rate limited, scored for scam patterns, and — above the
   * auto-hide threshold — hidden pending human review. Nothing is deleted
   * silently; a hidden comment still exists for a moderator to look at.
   */
  async create(
    eventId: string,
    author: AuthUser,
    input: {
      body: string;
      tag: CommentTag;
      parentCommentId?: string;
      thread: CommentThread;
    },
  ): Promise<ThreadComment> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, startsAt: true },
    });
    if (!event) throw new NotFoundException('Event not found.');

    // The recap thread is for people who were actually there, so it cannot open
    // before the show does.
    if (input.thread === 'recap' && event.startsAt > new Date()) {
      throw new BadRequestException('The recap thread opens once the show starts.');
    }

    await this.enforceRateLimit(author.id);

    let parent: { id: string; eventId: string; parentCommentId: string | null } | null = null;
    if (input.parentCommentId) {
      parent = await this.prisma.comment.findFirst({
        where: { id: input.parentCommentId, thread: input.thread },
        select: { id: true, eventId: true, parentCommentId: true },
      });
      if (!parent || parent.eventId !== eventId) {
        throw new NotFoundException('The comment you are replying to does not exist.');
      }
      // One level of nesting: a reply to a reply attaches to the same root.
      if (parent.parentCommentId) {
        parent = await this.prisma.comment.findUniqueOrThrow({
          where: { id: parent.parentCommentId },
          select: { id: true, eventId: true, parentCommentId: true },
        });
      }
    }

    const assessment = await this.assess(author, input.body, input.tag);

    const created = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          eventId,
          userId: author.id,
          parentCommentId: parent?.id ?? null,
          body: input.body.trim(),
          tag: input.tag,
          thread: input.thread,
          isHidden: assessment.autoHide,
          moderationState: assessment.autoHide
            ? 'hidden'
            : assessment.needsReview
              ? 'flagged'
              : 'visible',
          scamScore: assessment.score,
          scamSignals: assessment.signals as unknown as Prisma.InputJsonValue,
        },
        include: { user: true },
      });

      await tx.event.update({
        where: { id: eventId },
        data: { commentCount: { increment: 1 } },
      });
      if (parent) {
        await tx.comment.update({
          where: { id: parent.id },
          data: { replyCount: { increment: 1 } },
        });
      }
      return comment;
    });

    if (assessment.autoHide || assessment.needsReview) {
      this.logger.warn(
        `Comment ${created.id} scored ${assessment.score}: ${assessment.signals
          .map((signal) => signal.code)
          .join(', ')}`,
      );
    }

    await this.cache.invalidate(CacheKeys.event(eventId));
    return toThreadComment(created, false);
  }

  async like(commentId: string, userId: string) {
    const likeCount = await this.prisma.$transaction(async (tx) => {
      const created = await tx.commentLike.createMany({
        data: { commentId, userId },
        skipDuplicates: true,
      });
      if (created.count === 0) {
        const current = await tx.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: { likeCount: true },
        });
        return current.likeCount;
      }
      const updated = await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return updated.likeCount;
    });
    return { liked: true, likeCount };
  }

  async unlike(commentId: string, userId: string) {
    const likeCount = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.commentLike.deleteMany({ where: { commentId, userId } });
      if (deleted.count === 0) {
        const current = await tx.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: { likeCount: true },
        });
        return current.likeCount;
      }
      const [row] = await tx.$queryRaw<{ like_count: number }[]>`
        UPDATE comments
        SET like_count = GREATEST(like_count - 1, 0)
        WHERE id = ${commentId}::uuid
        RETURNING like_count
      `;
      return row?.like_count ?? 0;
    });
    return { liked: false, likeCount };
  }

  /** Authors can withdraw their own comment; moderators use the admin surface. */
  async softDelete(commentId: string, user: AuthUser) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, eventId: true, deletedAt: true },
    });
    if (!comment || comment.deletedAt) throw new NotFoundException('Comment not found.');
    if (comment.userId !== user.id && !user.isAdmin) {
      throw new ForbiddenException('You can only delete your own comments.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { deletedAt: new Date(), isHidden: true, moderationState: 'hidden' },
      });
      await tx.event.update({
        where: { id: comment.eventId },
        data: { commentCount: { decrement: 1 } },
      });
    });

    await this.cache.invalidate(CacheKeys.event(comment.eventId));
    return { deleted: true };
  }

  async report(
    commentId: string,
    reporterId: string,
    input: { reason: Prisma.CommentReportCreateInput['reason']; detail?: string },
  ) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true },
    });
    if (!comment) throw new NotFoundException('Comment not found.');

    await this.prisma.commentReport.upsert({
      where: { commentId_reporterId: { commentId, reporterId } },
      create: {
        comment: { connect: { id: commentId } },
        reporter: { connect: { id: reporterId } },
        reason: input.reason,
        detail: input.detail ?? null,
      },
      update: { reason: input.reason, detail: input.detail ?? null, status: 'open' },
    });

    // Three independent reports flag the comment for review immediately, without
    // waiting for a moderator to reach the queue.
    const reports = await this.prisma.commentReport.count({
      where: { commentId, status: 'open' },
    });
    if (reports >= 3) {
      await this.prisma.comment.updateMany({
        where: { id: commentId, moderationState: 'visible' },
        data: { moderationState: 'flagged' },
      });
    }

    return { reported: true, message: 'Thanks — a moderator will look at this.' };
  }

  private async assess(author: AuthUser, body: string, tag: CommentTag) {
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const recent = await this.prisma.comment.findMany({
      where: { userId: author.id, createdAt: { gte: oneHourAgo }, deletedAt: null },
      select: { body: true },
      take: 50,
    });

    const trimmed = body.trim();
    const { score, signals } = scoreComment({
      body: trimmed,
      tag,
      accountAgeHours: (Date.now() - author.createdAt.getTime()) / 3_600_000,
      recentCommentCount: recent.length,
      duplicateBodyCount: recent.filter((row) => row.body.trim() === trimmed).length,
    });

    return {
      score,
      signals,
      autoHide: score >= AUTO_HIDE_THRESHOLD,
      needsReview: score >= REVIEW_THRESHOLD,
    };
  }

  /**
   * Fails closed: if the counters can't be read the post is refused, because
   * an outage is exactly when a spam run would otherwise go unthrottled.
   */
  private async enforceRateLimit(userId: string): Promise<void> {
    const minute = await this.cache.increment(
      `ratelimit:comment:${userId}:m`,
      RATE_LIMITS.perMinute.windowSeconds,
    );
    if (minute === null) throw this.rateLimitUnavailable();
    if (minute > RATE_LIMITS.perMinute.max) {
      throw new BadRequestException('You are posting too quickly. Give it a minute.');
    }
    const hour = await this.cache.increment(
      `ratelimit:comment:${userId}:h`,
      RATE_LIMITS.perHour.windowSeconds,
    );
    if (hour === null) throw this.rateLimitUnavailable();
    if (hour > RATE_LIMITS.perHour.max) {
      throw new BadRequestException('You have hit the hourly posting limit.');
    }
  }

  private rateLimitUnavailable(): ServiceUnavailableException {
    this.logger.warn('Comment rate limiter unavailable (Redis down); refusing post.');
    return new ServiceUnavailableException(
      'Posting is temporarily unavailable. Please try again in a moment.',
    );
  }

  private async replyPreviews(parentIds: string[]): Promise<Map<string, CommentWithAuthor[]>> {
    const previews = new Map<string, CommentWithAuthor[]>();
    if (parentIds.length === 0) return previews;

    // DISTINCT-ON style preview: the oldest few replies per parent in one query.
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM (
        SELECT c.id,
               ROW_NUMBER() OVER (PARTITION BY c.parent_comment_id ORDER BY c.created_at ASC) AS rn
        FROM comments c
        WHERE c.parent_comment_id = ANY(${parentIds}::uuid[])
          AND c.deleted_at IS NULL
          AND c.moderation_state <> 'hidden'
      ) ranked
      WHERE rn <= ${REPLY_PREVIEW}
    `;
    if (ids.length === 0) return previews;

    const rows = await this.prisma.comment.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const row of rows) {
      if (!row.parentCommentId) continue;
      const bucket = previews.get(row.parentCommentId) ?? [];
      bucket.push(row);
      previews.set(row.parentCommentId, bucket);
    }
    return previews;
  }

  private async likedIds(userId: string | undefined, commentIds: string[]): Promise<Set<string>> {
    if (!userId || commentIds.length === 0) return new Set();
    const likes = await this.prisma.commentLike.findMany({
      where: { userId, commentId: { in: commentIds } },
      select: { commentId: true },
    });
    return new Set(likes.map((like) => like.commentId));
  }
}
