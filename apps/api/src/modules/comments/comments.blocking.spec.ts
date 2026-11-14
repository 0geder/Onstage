import type { AuthUser } from '../../common/auth/auth-user';
import type { CacheService } from '../../common/redis/cache.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { BlocksService } from '../blocks/blocks.service';
import { CommentsService } from './comments.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ROOT_ID = '22222222-2222-4222-8222-222222222222';
const REPLY_ID = '33333333-3333-4333-8333-333333333333';
const BLOCKED_ID = '44444444-4444-4444-8444-444444444444';

const viewer: AuthUser = {
  id: '55555555-5555-4555-8555-555555555555',
  handle: 'thandi',
  displayName: 'Thandi',
  email: 'thandi@example.com',
  isAdmin: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  bannedAt: null,
};

const author = {
  id: '66666666-6666-4666-8666-666666666666',
  handle: 'sipho',
  displayName: 'Sipho',
  avatar: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function commentRow(id: string, parentCommentId: string | null) {
  return {
    id,
    eventId: EVENT_ID,
    userId: author.id,
    parentCommentId,
    body: 'See you there',
    tag: 'none',
    thread: 'planning',
    likeCount: 0,
    replyCount: parentCommentId ? 0 : 1,
    isHidden: false,
    moderationState: 'visible',
    createdAt: new Date('2026-11-01T10:00:00Z'),
    deletedAt: null,
    user: author,
  };
}

function setup(blocked: string[]) {
  const prisma = {
    event: {
      findUnique: jest.fn().mockResolvedValue({
        id: EVENT_ID,
        status: 'scheduled',
        startsAt: new Date(Date.now() + 86_400_000),
      }),
    },
    comment: {
      findMany: jest
        .fn()
        // The top-level page first, then the reply-preview rows.
        .mockResolvedValueOnce([commentRow(ROOT_ID, null)])
        .mockResolvedValueOnce([commentRow(REPLY_ID, ROOT_ID)]),
    },
    commentLike: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: REPLY_ID }]),
  };
  const cache = { invalidate: jest.fn() };
  const blocks = { blockedIds: jest.fn().mockResolvedValue(blocked) };
  const service = new CommentsService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    blocks as unknown as BlocksService,
  );
  return { service, prisma, blocks };
}

const threadOptions = { sort: 'newest' as const, limit: 20, thread: 'planning' as const };

describe('CommentsService hides blocked authors', () => {
  it('excludes blocked authors from top-level comments and reply previews', async () => {
    const { service, prisma, blocks } = setup([BLOCKED_ID]);
    const result = await service.thread(EVENT_ID, threadOptions, viewer);

    expect(blocks.blockedIds).toHaveBeenCalledWith(viewer.id);
    expect(prisma.comment.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ userId: { notIn: [BLOCKED_ID] } }),
    );
    // Reply previews are raw SQL; the blocked ids travel as a bound parameter.
    const [, ...params] = prisma.$queryRaw.mock.calls[0];
    expect(params).toContainEqual([BLOCKED_ID]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].replies).toHaveLength(1);
  });

  it('leaves the query untouched when nobody is blocked', async () => {
    const { service, prisma } = setup([]);
    await service.thread(EVENT_ID, threadOptions, viewer);
    expect(prisma.comment.findMany.mock.calls[0][0].where).not.toHaveProperty('userId');
  });

  it('applies no blocks when signed out', async () => {
    const { service, blocks } = setup([]);
    await service.thread(EVENT_ID, threadOptions);
    expect(blocks.blockedIds).toHaveBeenCalledWith(undefined);
  });

  it('excludes blocked authors from the full replies list', async () => {
    const { service, prisma } = setup([BLOCKED_ID]);
    prisma.comment.findMany.mockReset().mockResolvedValue([commentRow(REPLY_ID, ROOT_ID)]);
    await service.replies(ROOT_ID, 20, undefined, viewer);
    expect(prisma.comment.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ parentCommentId: ROOT_ID, userId: { notIn: [BLOCKED_ID] } }),
    );
  });
});
