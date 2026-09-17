import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Invite-a-friend.
 *
 * Both sides earn an unlock — early on-sale alert access and a profile badge —
 * which costs nothing to grant and does not involve money changing hands.
 * Redemption is one-shot per invitee and enforced by a unique index rather than
 * by a check that races two concurrent signups.
 */

/** Unambiguous alphabet: no O/0, no I/1/L. Codes get read aloud and retyped. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 7;

/** How long after signup an invitee may still redeem a code. */
const REDEMPTION_WINDOW_HOURS = 72;

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Codes are permanent and created lazily on first request. */
  async codeFor(userId: string): Promise<{ code: string; invites: number; completed: number }> {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } });
    const code = existing?.code ?? (await this.mintCode(userId));

    const [invites, completed] = await Promise.all([
      this.prisma.referral.count({ where: { inviterId: userId } }),
      this.prisma.referral.count({ where: { inviterId: userId, completedAt: { not: null } } }),
    ]);

    return { code, invites, completed };
  }

  async redeem(inviteeId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();

    const owner = await this.prisma.referralCode.findUnique({
      where: { code },
      select: { userId: true },
    });
    if (!owner) throw new NotFoundException('That invite code does not exist.');
    if (owner.userId === inviteeId) {
      throw new BadRequestException('You cannot redeem your own invite code.');
    }

    const invitee = await this.prisma.user.findUniqueOrThrow({
      where: { id: inviteeId },
      select: { createdAt: true },
    });
    const ageHours = (Date.now() - invitee.createdAt.getTime()) / 3_600_000;
    if (ageHours > REDEMPTION_WINDOW_HOURS) {
      throw new BadRequestException(
        'Invite codes can only be redeemed in the first few days after signing up.',
      );
    }

    const already = await this.prisma.referral.findUnique({ where: { inviteeId } });
    if (already) throw new BadRequestException('You have already redeemed an invite code.');

    const referral = await this.prisma.referral.create({
      data: { inviterId: owner.userId, inviteeId, code, completedAt: new Date() },
    });

    return {
      redeemed: true,
      inviterId: referral.inviterId,
      unlock: 'early_on_sale_alerts',
      message: 'Invite redeemed. You and your friend both have early on-sale alerts.',
    };
  }

  /** Whether this user has an unlock from either side of a completed referral. */
  async hasEarlyAccess(userId: string): Promise<boolean> {
    const count = await this.prisma.referral.count({
      where: {
        completedAt: { not: null },
        OR: [{ inviterId: userId }, { inviteeId: userId }],
      },
    });
    return count > 0;
  }

  private async mintCode(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = this.randomCode();
      const taken = await this.prisma.referralCode.findUnique({
        where: { code },
        select: { id: true },
      });
      if (taken) continue;

      try {
        await this.prisma.referralCode.create({ data: { userId, code } });
        return code;
      } catch {
        // Lost a race on the unique index — whoever won, re-read and use theirs.
        const existing = await this.prisma.referralCode.findUnique({ where: { userId } });
        if (existing) return existing.code;
      }
    }
    throw new BadRequestException('Could not generate an invite code. Try again.');
  }

  private randomCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return code;
  }
}
