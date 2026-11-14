import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { BlocksService } from './blocks.service';

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';

function setup() {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: THEM }) },
    userBlock: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new BlocksService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('BlocksService.block', () => {
  it('records the block idempotently', async () => {
    const { service, prisma } = setup();
    await expect(service.block(ME, THEM)).resolves.toEqual({ blocked: true });
    expect(prisma.userBlock.createMany).toHaveBeenCalledWith({
      data: { blockerId: ME, blockedId: THEM },
      skipDuplicates: true,
    });
  });

  it('refuses to block yourself', async () => {
    const { service, prisma } = setup();
    await expect(service.block(ME, ME)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userBlock.createMany).not.toHaveBeenCalled();
  });

  it('404s for an unknown user', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.block(ME, THEM)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.userBlock.createMany).not.toHaveBeenCalled();
  });
});

describe('BlocksService.unblock', () => {
  it('removes only the viewer’s own block', async () => {
    const { service, prisma } = setup();
    await expect(service.unblock(ME, THEM)).resolves.toEqual({ blocked: false });
    expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerId: ME, blockedId: THEM },
    });
  });
});

describe('BlocksService.list', () => {
  it('lists blocked people with their display name, newest first', async () => {
    const { service, prisma } = setup();
    const blockedAt = new Date('2026-11-01T10:00:00Z');
    prisma.userBlock.findMany.mockResolvedValue([
      {
        blockerId: ME,
        blockedId: THEM,
        createdAt: blockedAt,
        blocked: { id: THEM, handle: 'spammer', displayName: 'Ticket Guy', avatar: null },
      },
    ]);

    await expect(service.list(ME)).resolves.toEqual({
      items: [
        {
          id: THEM,
          handle: 'spammer',
          displayName: 'Ticket Guy',
          avatar: null,
          blockedAt: blockedAt.toISOString(),
        },
      ],
    });
    expect(prisma.userBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blockerId: ME }, orderBy: { createdAt: 'desc' } }),
    );
  });
});

describe('BlocksService.blockedIds', () => {
  it('is empty for anonymous viewers without touching the database', async () => {
    const { service, prisma } = setup();
    await expect(service.blockedIds(undefined)).resolves.toEqual([]);
    expect(prisma.userBlock.findMany).not.toHaveBeenCalled();
  });

  it('returns the ids the viewer has blocked', async () => {
    const { service, prisma } = setup();
    prisma.userBlock.findMany.mockResolvedValue([{ blockedId: THEM }]);
    await expect(service.blockedIds(ME)).resolves.toEqual([THEM]);
  });
});
