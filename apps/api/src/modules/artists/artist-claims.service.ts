import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ArtistClaim, ArtistClaimStatus, ArtistViewerState } from '@onstage/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { toArtistClaim } from '../../common/mappers';
import { CacheKeys } from '../../common/redis/cache-keys';
import { CacheService } from '../../common/redis/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CLAIM_EVIDENCE_MIN } from './dto/artist-claim.dto';

/**
 * Claim-your-profile.
 *
 * Catalogue imports create profiles nobody has vouched for. A claim is how the
 * real artist (or their team) asks to take one over; an operator checks the
 * evidence by hand, and an approved claim is what lets that account edit the
 * profile and marks it verified.
 *
 * Approving one claim leaves any other pending claims on the same artist where
 * they are. A band can legitimately have a member and a manager both asking,
 * so the operator decides each one; the queue shows who already manages the
 * profile so a second approval is a deliberate choice. Once a profile has an
 * approved claim, new claims on it are refused outright.
 */
@Injectable()
export class ArtistClaimsService {
  private readonly logger = new Logger(ArtistClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    user: AuthUser,
    artistId: string,
    input: { evidence: string; contactUrl?: string },
  ): Promise<ArtistClaim> {
    // Length is validated on the raw string; padding with spaces is not evidence.
    const evidence = input.evidence.trim();
    if (evidence.length < CLAIM_EVIDENCE_MIN) {
      throw new BadRequestException(
        `Tell us who you are and how we can check it, in at least ${CLAIM_EVIDENCE_MIN} characters.`,
      );
    }

    const artist = await this.prisma.artist.findUnique({
      where: { id: artistId },
      select: { id: true },
    });
    if (!artist) throw new NotFoundException('Artist not found.');

    const [approved, existing] = await Promise.all([
      this.prisma.artistClaim.findFirst({
        where: { artistId, status: 'approved' },
        select: { userId: true },
      }),
      this.prisma.artistClaim.findUnique({
        where: { artistId_userId: { artistId, userId: user.id } },
        select: { status: true },
      }),
    ]);
    if (approved) {
      throw new ConflictException(
        approved.userId === user.id
          ? 'You already manage this profile.'
          : 'This profile has already been claimed and verified. If that is wrong, contact Onstage.',
      );
    }
    if (existing?.status === 'pending') {
      throw new ConflictException('Your claim on this profile is already waiting for review.');
    }

    const contactUrl = input.contactUrl ?? null;
    try {
      // One row per (artist, user): a rejected claim is reopened with the new
      // evidence rather than duplicated, and goes to the back of the queue.
      const row = await this.prisma.artistClaim.upsert({
        where: { artistId_userId: { artistId, userId: user.id } },
        create: { artistId, userId: user.id, evidence, contactUrl },
        update: {
          evidence,
          contactUrl,
          status: 'pending',
          reviewedAt: null,
          reviewedById: null,
          createdAt: new Date(),
        },
        include: { artist: true },
      });
      return toArtistClaim(row);
    } catch (error) {
      // Two submissions racing each other: the first one won.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Your claim on this profile is already waiting for review.');
      }
      throw error;
    }
  }

  /** The signed-in user's own claims, newest first. */
  async listForUser(userId: string): Promise<ArtistClaim[]> {
    const rows = await this.prisma.artistClaim.findMany({
      where: { userId },
      include: { artist: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toArtistClaim);
  }

  /** Per-viewer claim fields for the profile response. Never cached: they differ per user. */
  async viewerState(
    user: AuthUser | undefined,
    artistId: string,
  ): Promise<Pick<ArtistViewerState, 'viewerManages' | 'viewerClaimStatus'>> {
    if (!user) return { viewerManages: false, viewerClaimStatus: null };

    const claim = await this.prisma.artistClaim.findUnique({
      where: { artistId_userId: { artistId, userId: user.id } },
      select: { status: true },
    });
    const status = (claim?.status ?? null) as ArtistClaimStatus | null;
    return { viewerManages: user.isAdmin || status === 'approved', viewerClaimStatus: status };
  }

  /** Whether this user may edit the profile: an approved claim, or platform staff. */
  async canManage(user: AuthUser, artistId: string): Promise<boolean> {
    if (user.isAdmin) return true;
    const claim = await this.prisma.artistClaim.findUnique({
      where: { artistId_userId: { artistId, userId: user.id } },
      select: { status: true },
    });
    return claim?.status === 'approved';
  }

  // ── Operator review ─────────────────────────────────────

  /**
   * Pending claims, oldest first. Each one carries who already manages the
   * profile, so approving a second claimant is never an accident.
   */
  async pendingQueue(limit: number) {
    const claims = await this.prisma.artistClaim.findMany({
      where: { status: 'pending' },
      include: {
        artist: {
          select: {
            id: true,
            name: true,
            slug: true,
            verified: true,
            homeCity: true,
            socialLinks: true,
            streamingLinks: true,
          },
        },
        user: {
          select: { id: true, handle: true, displayName: true, email: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const managers = await this.prisma.artistClaim.findMany({
      where: { artistId: { in: claims.map((claim) => claim.artistId) }, status: 'approved' },
      select: { artistId: true, user: { select: { handle: true } } },
    });

    return claims.map((claim) => ({
      id: claim.id,
      evidence: claim.evidence,
      contactUrl: claim.contactUrl,
      createdAt: claim.createdAt.toISOString(),
      artist: claim.artist,
      claimant: { ...claim.user, createdAt: claim.user.createdAt.toISOString() },
      managedBy: managers
        .filter((manager) => manager.artistId === claim.artistId)
        .map((manager) => manager.user.handle),
    }));
  }

  /**
   * Approves or rejects a pending claim. Approval marks the profile verified.
   * The claimant hears either way: they asked, so the answer is not optional.
   */
  async review(
    claimId: string,
    decision: 'approve' | 'reject',
    moderatorId: string | null,
  ): Promise<{ id: string; status: ArtistClaimStatus; reviewedAt: string }> {
    const claim = await this.prisma.artistClaim.findUnique({
      where: { id: claimId },
      include: { artist: { select: { id: true, name: true, slug: true } } },
    });
    if (!claim) throw new NotFoundException('Claim not found.');

    const status: ArtistClaimStatus = decision === 'approve' ? 'approved' : 'rejected';
    const reviewedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Conditional on still being pending, so two operators deciding the
      // same claim at once cannot both win.
      const updated = await tx.artistClaim.updateMany({
        where: { id: claimId, status: 'pending' },
        data: { status, reviewedAt, reviewedById: moderatorId },
      });
      if (updated.count === 0) throw new ConflictException('This claim has already been reviewed.');

      if (status === 'approved') {
        await tx.artist.update({ where: { id: claim.artistId }, data: { verified: true } });
      }

      await this.notifications.enqueue(tx, {
        userId: claim.userId,
        kind: 'artist_claim_reviewed',
        // A rejected claim can be resubmitted and reviewed again, so the
        // decision time is part of the key.
        dedupeKey: `artist_claim:${claimId}:${status}:${reviewedAt.getTime()}`,
        payload: {
          artistId: claim.artist.id,
          artistSlug: claim.artist.slug,
          status,
          title:
            status === 'approved'
              ? `You now manage ${claim.artist.name} on Onstage`
              : `We couldn't verify your claim to ${claim.artist.name}`,
          body:
            status === 'approved'
              ? 'Your profile is verified. You can now edit the bio, home city and links.'
              : 'You can submit the claim again with more detail, such as a link from an official account.',
        },
      });
    });

    await this.cache.invalidate(
      CacheKeys.artist(claim.artist.id),
      CacheKeys.artist(claim.artist.slug),
    );
    this.logger.log(`Artist claim ${claimId} ${status} by ${moderatorId ?? 'admin token'}`);
    return { id: claimId, status, reviewedAt: reviewedAt.toISOString() };
  }
}
