import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { HowlerController } from './howler.controller';
import { HowlerService } from './howler.service';

const TOKEN = 'a-long-shared-webhook-token-for-tests';

const body = {
  action: 'event_amend',
  event_id: 4821,
  event_organiser_id: 77,
  event_name: 'Bokani Dyer Trio Live at The Orbit',
  event_start_time: '2026-11-20T20:00:00+02:00',
  event_last_modified_date: '2026-11-06T09:00:00+02:00',
};

function setup({ updated = 1, createError }: { updated?: number; createError?: Error } = {}) {
  const prisma = {
    howlerEvent: {
      updateMany: jest.fn().mockResolvedValue({ count: updated }),
      create: createError
        ? jest.fn().mockRejectedValue(createError)
        : jest.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: new HowlerService(prisma as unknown as PrismaService) };
}

function controller(settings: { webhookToken: string; organiserIds: number[] }) {
  const { prisma, service } = setup();
  const config = { get: jest.fn().mockReturnValue(settings) };
  return {
    prisma,
    controller: new HowlerController(service, config as unknown as ConfigService),
  };
}

describe('HowlerController', () => {
  it('is hidden until a token is configured', async () => {
    const { controller: c } = controller({ webhookToken: '', organiserIds: [] });
    await expect(c.receiveEvent(TOKEN, body)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a missing or wrong token', async () => {
    const { controller: c, prisma } = controller({ webhookToken: TOKEN, organiserIds: [] });
    await expect(c.receiveEvent(undefined, body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(c.receiveEvent('wrong', body)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.howlerEvent.updateMany).not.toHaveBeenCalled();
  });

  it('stores an event sent with the right token', async () => {
    const { controller: c, prisma } = controller({ webhookToken: TOKEN, organiserIds: [] });
    await expect(c.receiveEvent(TOKEN, body)).resolves.toEqual({ result: 'stored' });
    expect(prisma.howlerEvent.updateMany).toHaveBeenCalledWith({
      where: { howlerEventId: 4821, modifiedAt: { lte: new Date('2026-11-06T07:00:00Z') } },
      data: expect.objectContaining({
        organiserId: 77,
        payload: body,
        startsAt: new Date('2026-11-20T18:00:00Z'),
      }),
    });
  });

  it('acknowledges but ignores organisers not on the allow-list', async () => {
    const { controller: c, prisma } = controller({ webhookToken: TOKEN, organiserIds: [12] });
    await expect(c.receiveEvent(TOKEN, body)).resolves.toEqual({ result: 'ignored' });
    expect(prisma.howlerEvent.updateMany).not.toHaveBeenCalled();
  });
});

describe('HowlerService', () => {
  it('creates the row the first time an event arrives', async () => {
    const { prisma, service } = setup({ updated: 0 });
    await expect(service.storeEvent(body, [])).resolves.toBe('stored');
    expect(prisma.howlerEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ howlerEventId: 4821 }),
    });
  });

  it('keeps the newer copy when an older delivery arrives late', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service } = setup({ updated: 0, createError: conflict });
    await expect(service.storeEvent(body, [])).resolves.toBe('stale');
  });

  it('ignores actions it does not know', async () => {
    const { prisma, service } = setup();
    await expect(service.storeEvent({ ...body, action: 'event_delete' }, [])).resolves.toBe(
      'ignored',
    );
    expect(prisma.howlerEvent.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['not an object', 'nope'],
    ['missing the event id', { ...body, event_id: undefined }],
    ['with a bad modified date', { ...body, event_last_modified_date: 'yesterday' }],
  ])('rejects a body %s', async (_label, bad) => {
    const { service } = setup();
    await expect(service.storeEvent(bad, [])).rejects.toBeInstanceOf(BadRequestException);
  });
});
