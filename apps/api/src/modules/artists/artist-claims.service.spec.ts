import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import type { CacheService } from '../../common/redis/cache.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { ArtistClaimsService } from './artist-claims.service';
import { CreateArtistClaimDto } from './dto/artist-claim.dto';
import { UpdateArtistProfileDto } from './dto/artist-profile.dto';

const ARTIST_ID = '11111111-1111-4111-8111-111111111111';
const CLAIM_ID = '22222222-2222-4222-8222-222222222222';

const user: AuthUser = {
  id: '33333333-3333-4333-8333-333333333333',
  handle: 'thandi',
  displayName: 'Thandi',
  email: 'thandi@example.com',
  isAdmin: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  bannedAt: null,
};

const artistRow = {
  id: ARTIST_ID,
  name: 'The Kiffness',
  slug: 'the-kiffness',
  verified: false,
  bio: null,
  genres: [],
  homeCity: null,
  country: 'ZA',
  profileImage: null,
  bannerImage: null,
  streamingLinks: {},
  socialLinks: {},
  externalIds: {},
  followerCount: 0,
  ratingAvg: null,
  ratingCount: 0,
  liveRatingAvg: null,
  liveRatingCount: 0,
  isPromoted: false,
  promotedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const EVIDENCE = 'I am the band manager; we can confirm from the official Instagram.';

function setup() {
  const tx = {
    artistClaim: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    artist: { update: jest.fn().mockResolvedValue(artistRow) },
  };
  const prisma = {
    artist: { findUnique: jest.fn().mockResolvedValue({ id: ARTIST_ID }) },
    artistClaim: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({
          id: CLAIM_ID,
          ...create,
          status: 'pending',
          reviewedAt: null,
          reviewedById: null,
          createdAt: new Date(),
          artist: artistRow,
        }),
      ),
    },
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
  const cache = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const notifications = { enqueue: jest.fn().mockResolvedValue(undefined) };

  const service = new ArtistClaimsService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, tx, cache, notifications };
}

describe('ArtistClaimsService.create', () => {
  it('opens a pending claim with the trimmed evidence and contact link', async () => {
    const { service, prisma } = setup();
    const claim = await service.create(user, ARTIST_ID, {
      evidence: `  ${EVIDENCE}  `,
      contactUrl: 'https://instagram.com/thekiffness',
    });

    expect(claim.status).toBe('pending');
    expect(claim.artist.slug).toBe('the-kiffness');
    expect(prisma.artistClaim.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          artistId: ARTIST_ID,
          userId: user.id,
          evidence: EVIDENCE,
          contactUrl: 'https://instagram.com/thekiffness',
        },
      }),
    );
  });

  it('refuses evidence that is only long because of whitespace', async () => {
    const { service } = setup();
    await expect(
      service.create(user, ARTIST_ID, { evidence: `short${' '.repeat(30)}` }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s for an unknown artist', async () => {
    const { service, prisma } = setup();
    prisma.artist.findUnique.mockResolvedValue(null);
    await expect(service.create(user, ARTIST_ID, { evidence: EVIDENCE })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('409s once someone else holds an approved claim', async () => {
    const { service, prisma } = setup();
    prisma.artistClaim.findFirst.mockResolvedValue({ userId: 'someone-else' });
    await expect(service.create(user, ARTIST_ID, { evidence: EVIDENCE })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.artistClaim.upsert).not.toHaveBeenCalled();
  });

  it('409s while the same user already has a pending claim', async () => {
    const { service, prisma } = setup();
    prisma.artistClaim.findUnique.mockResolvedValue({ status: 'pending' });
    await expect(service.create(user, ARTIST_ID, { evidence: EVIDENCE })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reopens a rejected claim instead of adding a second row', async () => {
    const { service, prisma } = setup();
    prisma.artistClaim.findUnique.mockResolvedValue({ status: 'rejected' });
    await service.create(user, ARTIST_ID, { evidence: EVIDENCE });
    expect(prisma.artistClaim.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'pending',
          reviewedAt: null,
          reviewedById: null,
        }),
      }),
    );
  });
});

describe('ArtistClaimsService viewer state', () => {
  it('is empty when signed out', async () => {
    const { service } = setup();
    await expect(service.viewerState(undefined, ARTIST_ID)).resolves.toEqual({
      viewerManages: false,
      viewerClaimStatus: null,
    });
  });

  it('manages only with an approved claim', async () => {
    const { service, prisma } = setup();
    prisma.artistClaim.findUnique.mockResolvedValueOnce({ status: 'pending' });
    await expect(service.viewerState(user, ARTIST_ID)).resolves.toEqual({
      viewerManages: false,
      viewerClaimStatus: 'pending',
    });

    prisma.artistClaim.findUnique.mockResolvedValueOnce({ status: 'approved' });
    await expect(service.canManage(user, ARTIST_ID)).resolves.toBe(true);
  });

  it('lets platform staff manage without a claim', async () => {
    const { service, prisma } = setup();
    await expect(service.canManage({ ...user, isAdmin: true }, ARTIST_ID)).resolves.toBe(true);
    expect(prisma.artistClaim.findUnique).not.toHaveBeenCalled();
  });
});

describe('ArtistClaimsService.review', () => {
  const pendingClaim = {
    id: CLAIM_ID,
    artistId: ARTIST_ID,
    userId: user.id,
    status: 'pending',
    artist: { id: ARTIST_ID, name: 'The Kiffness', slug: 'the-kiffness' },
  };
  const MODERATOR = '44444444-4444-4444-8444-444444444444';

  it('approves: verifies the artist, records the moderator, tells the claimant', async () => {
    const { service, prisma, tx, cache, notifications } = setup();
    prisma.artistClaim.findUnique.mockResolvedValue(pendingClaim);

    const result = await service.review(CLAIM_ID, 'approve', MODERATOR);

    expect(result.status).toBe('approved');
    expect(tx.artistClaim.updateMany).toHaveBeenCalledWith({
      where: { id: CLAIM_ID, status: 'pending' },
      data: expect.objectContaining({ status: 'approved', reviewedById: MODERATOR }),
    });
    expect(tx.artist.update).toHaveBeenCalledWith({
      where: { id: ARTIST_ID },
      data: { verified: true },
    });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: user.id, kind: 'artist_claim_reviewed' }),
    );
    expect(cache.invalidate).toHaveBeenCalledWith('artist:' + ARTIST_ID, 'artist:the-kiffness');
  });

  it('rejects without touching the artist', async () => {
    const { service, prisma, tx, notifications } = setup();
    prisma.artistClaim.findUnique.mockResolvedValue(pendingClaim);

    const result = await service.review(CLAIM_ID, 'reject', null);

    expect(result.status).toBe('rejected');
    expect(tx.artist.update).not.toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
  });

  it('409s when the claim was already decided', async () => {
    const { service, prisma, tx, notifications } = setup();
    prisma.artistClaim.findUnique.mockResolvedValue({ ...pendingClaim, status: 'approved' });
    tx.artistClaim.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.review(CLAIM_ID, 'reject', null)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
});

describe('claim and profile DTOs', () => {
  const errorsFor = async <T extends object>(cls: new () => T, plain: object) =>
    (
      await validate(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true })
    ).map((error) => error.property);

  it('requires 20-2000 characters of evidence', async () => {
    expect(await errorsFor(CreateArtistClaimDto, { evidence: 'too short' })).toEqual(['evidence']);
    expect(await errorsFor(CreateArtistClaimDto, { evidence: 'x'.repeat(2001) })).toEqual([
      'evidence',
    ]);
    expect(await errorsFor(CreateArtistClaimDto, { evidence: EVIDENCE })).toEqual([]);
  });

  it('accepts only an http(s) contact link', async () => {
    expect(
      await errorsFor(CreateArtistClaimDto, {
        evidence: EVIDENCE,
        contactUrl: 'javascript:alert(1)',
      }),
    ).toEqual(['contactUrl']);
    expect(
      await errorsFor(CreateArtistClaimDto, {
        evidence: EVIDENCE,
        contactUrl: 'https://thekiffness.com',
      }),
    ).toEqual([]);
  });

  it('keeps profile edits to safe links and https images', async () => {
    expect(
      await errorsFor(UpdateArtistProfileDto, {
        bio: 'Cape Town based.',
        socialLinks: { instagram: 'https://instagram.com/thekiffness' },
        profileImage: 'https://cdn.example.com/a.jpg',
      }),
    ).toEqual([]);
    expect(
      await errorsFor(UpdateArtistProfileDto, { profileImage: 'http://cdn.example.com/a.jpg' }),
    ).toEqual(['profileImage']);
    expect(
      await errorsFor(UpdateArtistProfileDto, {
        socialLinks: { myspace: 'https://myspace.com/x' },
      }),
    ).toEqual(['socialLinks']);
    expect(
      await errorsFor(UpdateArtistProfileDto, {
        streamingLinks: { spotify: 'javascript:void(0)' },
      }),
    ).toEqual(['streamingLinks']);
    expect(await errorsFor(UpdateArtistProfileDto, { bio: 'x'.repeat(2001) })).toEqual(['bio']);
    // Operator-only fields are not accepted from a claimant at all.
    expect(await errorsFor(UpdateArtistProfileDto, { name: 'Someone else' })).toEqual(['name']);
  });
});
