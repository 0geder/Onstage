import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BlockedUser } from '@onstage/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Upper bound on a block list; far beyond any real use, it keeps the list query bounded. */
const MAX_LISTED = 500;

/**
 * Person-to-person blocks (App Store guideline 1.2).
 *
 * A block is one-way and silent: the blocker stops seeing the blocked person's
 * comments and replies, and the blocked person is never told.
 */
@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself.');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found.');

    await this.prisma.userBlock.createMany({
      data: { blockerId, blockedId },
      skipDuplicates: true,
    });
    return { blocked: true };
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
    return { blocked: false };
  }

  async list(blockerId: string): Promise<{ items: BlockedUser[] }> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId },
      include: { blocked: { select: { id: true, handle: true, displayName: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED,
    });
    return {
      items: rows.map((row) => ({
        id: row.blocked.id,
        handle: row.blocked.handle,
        displayName: row.blocked.displayName,
        avatar: row.blocked.avatar,
        blockedAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Ids the viewer has blocked; empty for anonymous viewers. */
  async blockedIds(viewerId: string | undefined): Promise<string[]> {
    if (!viewerId) return [];
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: viewerId },
      select: { blockedId: true },
    });
    return rows.map((row) => row.blockedId);
  }
}
