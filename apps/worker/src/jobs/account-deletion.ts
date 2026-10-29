import type { Auth } from 'firebase-admin/auth';
import type { Prisma } from '@prisma/client';
import { config } from '../config';
import { logger } from '../logger';
import { prisma } from '../prisma';

/**
 * Account deletion (POPIA).
 *
 * The API only records the request (users.deletion_requested_at) and stops
 * outbound notifications. This job carries it out once the grace period has
 * passed — long enough to change one's mind, well inside the 30 days the app
 * promises.
 *
 * Almost everything goes through ON DELETE CASCADE from users: follows,
 * attendance, ratings, comments, likes, reports filed, push tokens, outbox,
 * consents, badges, claims, referral code and referrals, person-to-person
 * follows. Ticket clicks are SET NULL (affiliate reconciliation keeps the
 * anonymous click), as are reports the user handled as a moderator.
 *
 * Two things need handling by hand:
 *
 *  1. Comments other people replied to. replies cascade from their parent, so
 *     deleting a root comment would silently delete everyone else's replies with
 *     it. Those roots are instead anonymised — body replaced, authorship moved to
 *     a single placeholder account — so the thread survives without anything
 *     of the deleted user in it. Roots with no live replies from others, and all
 *     of the user's own replies, are deleted outright.
 *  2. Denormalised counters the deleted rows fed (artist followers and rating
 *     averages, event attendance and comment counts, comment reply and like
 *     counts). They are recomputed from the surviving rows in the same
 *     transaction, the way the API recomputes rating averages.
 *
 * Not covered: Sign in with Apple token revocation (Apple requires the app to
 * revoke the user's refresh token on deletion; that needs the Apple
 * authorization code captured at sign-in, which nothing stores today). Cached
 * API responses in Redis expire on their own TTL.
 */

/** Placeholder author for anonymised comments. `.invalid` can never be a real address. */
const PLACEHOLDER_EMAIL = 'deleted-user@onstage.invalid';
/** A hyphen keeps it outside the handle pattern users can choose or be assigned. */
const PLACEHOLDER_HANDLE = 'deleted-user';
const ANONYMISED_BODY = '[deleted]';

/** Users per run. Deletions are not urgent to the minute; a backlog drains over days. */
const BATCH = 50;

export async function executeAccountDeletions(): Promise<{ deleted: number; failed: number }> {
  const cutoff = new Date(Date.now() - config.accountDeletion.graceDays * 86_400_000);

  const due = await prisma.user.findMany({
    where: { deletionRequestedAt: { lte: cutoff }, email: { not: PLACEHOLDER_EMAIL } },
    select: { id: true, authUid: true },
    orderBy: { deletionRequestedAt: 'asc' },
    take: BATCH,
  });
  if (due.length === 0) return { deleted: 0, failed: 0 };

  const auth = await firebaseAuth();
  if (!auth) {
    logger.warn(
      'Firebase Admin credentials are not configured; deleting database records only. ' +
        'The Firebase Auth users must be removed by hand.',
    );
  }

  let deleted = 0;
  let failed = 0;

  for (const user of due) {
    try {
      // Auth first: if it fails the database row survives and the whole
      // deletion is retried tomorrow. The other order would orphan the Auth
      // user with nothing left pointing at it.
      if (auth && user.authUid) await deleteAuthUser(auth, user.authUid);

      const removed = await deleteUserData(user.id, cutoff);
      if (!removed) continue;

      logger.info(
        { userId: user.id, authUser: auth && user.authUid ? 'deleted' : 'not deleted' },
        'Account deleted',
      );
      deleted += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { userId: user.id, err: (error as Error).message },
        'Account deletion failed; will retry next run',
      );
    }
  }

  return { deleted, failed };
}

/** Returns false when the request was withdrawn after this run selected the user. */
async function deleteUserData(userId: string, cutoff: Date): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const [stillDue] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM users
        WHERE id = ${userId}::uuid AND deletion_requested_at <= ${cutoff}
        FOR UPDATE
      `;
      if (!stillDue) return false;

      // Capture what the cascade is about to remove, so the counters those rows
      // fed can be recomputed once they are gone.
      const [follows, ratings, attendances, likes, comments] = await Promise.all([
        tx.follow.findMany({ where: { userId }, select: { artistId: true } }),
        tx.rating.findMany({ where: { userId }, select: { artistId: true } }),
        tx.attendance.findMany({ where: { userId }, select: { eventId: true } }),
        tx.commentLike.findMany({ where: { userId }, select: { commentId: true } }),
        tx.comment.findMany({
          where: { userId },
          select: { id: true, eventId: true, parentCommentId: true, deletedAt: true },
        }),
      ]);

      const liveRoots = comments
        .filter((comment) => !comment.parentCommentId && !comment.deletedAt)
        .map((comment) => comment.id);
      const repliedTo =
        liveRoots.length === 0
          ? []
          : await tx.comment.findMany({
              where: {
                parentCommentId: { in: liveRoots },
                userId: { not: userId },
                deletedAt: null,
                moderationState: { not: 'hidden' },
              },
              select: { parentCommentId: true },
              distinct: ['parentCommentId'],
            });
      const anonymise = repliedTo.map((reply) => reply.parentCommentId as string);

      if (anonymise.length > 0) {
        const placeholderId = await placeholderUser(tx);
        await tx.comment.updateMany({
          where: { id: { in: anonymise } },
          data: { userId: placeholderId, body: ANONYMISED_BODY },
        });
      }

      await tx.user.delete({ where: { id: userId } });

      await recount(tx, {
        followedArtists: unique(follows.map((row) => row.artistId)),
        ratedArtists: unique(ratings.map((row) => row.artistId)),
        events: unique([
          ...attendances.map((row) => row.eventId),
          ...comments.map((row) => row.eventId),
        ]),
        repliedComments: unique(
          comments.map((row) => row.parentCommentId).filter((id): id is string => Boolean(id)),
        ),
        likedComments: unique(likes.map((row) => row.commentId)),
      });

      return true;
    },
    { timeout: 60_000 },
  );
}

interface Affected {
  followedArtists: string[];
  ratedArtists: string[];
  events: string[];
  repliedComments: string[];
  likedComments: string[];
}

/**
 * Recomputes counters from the surviving rows rather than decrementing, so a
 * counter that had already drifted is corrected rather than pushed further.
 * Each rule mirrors how the API maintains that counter.
 */
async function recount(tx: Prisma.TransactionClient, affected: Affected): Promise<void> {
  if (affected.followedArtists.length > 0) {
    await tx.$executeRaw`
      UPDATE artists a
      SET follower_count = (SELECT COUNT(*)::int FROM follows f WHERE f.artist_id = a.id)
      WHERE a.id = ANY(${affected.followedArtists}::uuid[])
    `;
  }

  if (affected.ratedArtists.length > 0) {
    await tx.$executeRaw`
      UPDATE artists a
      SET rating_avg = s.avg,
          rating_count = s.count,
          live_rating_avg = s.live_avg,
          live_rating_count = s.live_count
      FROM (
        SELECT ids.id,
               ROUND((AVG(r.score) FILTER (WHERE r.event_id IS NULL))::numeric, 2)::float8 AS avg,
               (COUNT(r.id) FILTER (WHERE r.event_id IS NULL))::int AS count,
               ROUND((AVG(r.score) FILTER (WHERE r.event_id IS NOT NULL))::numeric, 2)::float8 AS live_avg,
               (COUNT(r.id) FILTER (WHERE r.event_id IS NOT NULL))::int AS live_count
        FROM unnest(${affected.ratedArtists}::uuid[]) AS ids(id)
        LEFT JOIN ratings r ON r.artist_id = ids.id
        GROUP BY ids.id
      ) s
      WHERE a.id = s.id
    `;
  }

  if (affected.events.length > 0) {
    // comment_count follows the API: every comment and reply counts until it is
    // soft-deleted. Cascaded replies from other users are gone too, so this
    // also covers them.
    await tx.$executeRaw`
      UPDATE events e
      SET interested_count = (SELECT COUNT(*)::int FROM attendances a WHERE a.event_id = e.id AND a.state = 'interested'),
          going_count      = (SELECT COUNT(*)::int FROM attendances a WHERE a.event_id = e.id AND a.state = 'going'),
          attended_count   = (SELECT COUNT(*)::int FROM attendances a WHERE a.event_id = e.id AND a.state = 'attended'),
          comment_count    = (SELECT COUNT(*)::int FROM comments c WHERE c.event_id = e.id AND c.deleted_at IS NULL)
      WHERE e.id = ANY(${affected.events}::uuid[])
    `;
  }

  if (affected.repliedComments.length > 0) {
    // reply_count, like the API's, is never decremented by a soft delete.
    await tx.$executeRaw`
      UPDATE comments c
      SET reply_count = (SELECT COUNT(*)::int FROM comments r WHERE r.parent_comment_id = c.id)
      WHERE c.id = ANY(${affected.repliedComments}::uuid[])
    `;
  }

  if (affected.likedComments.length > 0) {
    await tx.$executeRaw`
      UPDATE comments c
      SET like_count = (SELECT COUNT(*)::int FROM comment_likes l WHERE l.comment_id = c.id)
      WHERE c.id = ANY(${affected.likedComments}::uuid[])
    `;
  }
}

/** The single account anonymised comments are attributed to. Banned, so it can never write. */
async function placeholderUser(tx: Prisma.TransactionClient): Promise<string> {
  const user = await tx.user.upsert({
    where: { email: PLACEHOLDER_EMAIL },
    update: {},
    create: {
      email: PLACEHOLDER_EMAIL,
      handle: PLACEHOLDER_HANDLE,
      displayName: 'Deleted user',
      bannedAt: new Date(),
      banReason: 'System placeholder for comments kept after account deletion',
    },
    select: { id: true },
  });
  return user.id;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

let cachedAuth: Auth | null | undefined;

/** Firebase Admin, initialised once; null when credentials are not configured. */
async function firebaseAuth(): Promise<Auth | null> {
  if (cachedAuth !== undefined) return cachedAuth;
  if (!config.firebase) {
    cachedAuth = null;
    return cachedAuth;
  }

  const { cert, getApps, initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const app = getApps()[0] ?? initializeApp({ credential: cert(config.firebase) });
  cachedAuth = getAuth(app);
  return cachedAuth;
}

async function deleteAuthUser(auth: Auth, uid: string): Promise<void> {
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    // Already gone — a previous run got this far before failing. Not an error.
    if ((error as { code?: string }).code === 'auth/user-not-found') return;
    throw error;
  }
}
