import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import type { CacheService } from '../../common/redis/cache.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ArtistClaimsService } from '../artists/artist-claims.service';
import { SetLivestreamsDto } from './dto/livestreams.dto';
import { EventsService } from './events.service';

const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const ARTIST_ID = '11111111-1111-4111-8111-111111111111';

const user: AuthUser = {
  id: '33333333-3333-4333-8333-333333333333',
  handle: 'thandi',
  displayName: 'Thandi',
  email: 'thandi@example.com',
  isAdmin: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  bannedAt: null,
};

function setup({ manages, exists = true }: { manages: boolean; exists?: boolean }) {
  const prisma = {
    event: {
      findUnique: jest
        .fn()
        .mockResolvedValue(exists ? { slug: 'kiffness-cpt', primaryArtistId: ARTIST_ID } : null),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ livestreamLinks: data.livestreamLinks }),
        ),
    },
  };
  const cache = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const claims = { canManage: jest.fn().mockResolvedValue(manages) };
  const service = new EventsService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    claims as unknown as ArtistClaimsService,
  );
  return { service, prisma, cache, claims };
}

describe('EventsService.setLivestreams', () => {
  const links = { youtube: 'https://www.youtube.com/watch?v=abc' };

  it("lets the headliner's verified team set links and clears the cached event", async () => {
    const { service, prisma, cache, claims } = setup({ manages: true });

    await expect(service.setLivestreams(user, EVENT_ID, links)).resolves.toEqual(links);
    expect(claims.canManage).toHaveBeenCalledWith(user, ARTIST_ID);
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { livestreamLinks: links } }),
    );
    expect(cache.invalidate).toHaveBeenCalledWith(`event:${EVENT_ID}`, 'event:kiffness-cpt');
  });

  it('refuses anyone else', async () => {
    const { service, prisma } = setup({ manages: false });

    await expect(service.setLivestreams(user, EVENT_ID, links)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('404s for an unknown event', async () => {
    const { service } = setup({ manages: true, exists: false });

    await expect(service.setLivestreams(user, EVENT_ID, links)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('SetLivestreamsDto', () => {
  const errorsFor = (links: unknown) =>
    validate(plainToInstance(SetLivestreamsDto, { links })).then((errors) => errors.length);

  it('accepts known platforms with web links, and an empty map', async () => {
    await expect(
      errorsFor({ youtube: 'https://youtu.be/x', twitch: 'https://twitch.tv/x' }),
    ).resolves.toBe(0);
    await expect(errorsFor({})).resolves.toBe(0);
  });

  it('rejects unknown platforms and non-web links', async () => {
    await expect(errorsFor({ myspace: 'https://myspace.com/x' })).resolves.toBeGreaterThan(0);
    await expect(errorsFor({ youtube: 'javascript:alert(1)' })).resolves.toBeGreaterThan(0);
  });
});
