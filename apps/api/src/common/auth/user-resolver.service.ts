import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth-user';
import type { VerifiedToken } from './token-verifier.service';

const HANDLE_MAX = 30;

/**
 * Maps a verified identity provider token onto an Onstage user row, creating
 * one on first sight. Sign-up is therefore implicit: the first authenticated
 * request provisions the account.
 */
@Injectable()
export class UserResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(token: VerifiedToken): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({ where: { authUid: token.uid } });
    const user = existing ?? (await this.provision(token));

    if (user.bannedAt) {
      throw new ForbiddenException(user.banReason ?? 'This account has been suspended.');
    }

    return {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      email: user.email,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      bannedAt: user.bannedAt,
    };
  }

  private async provision(token: VerifiedToken) {
    const email = token.email ?? `${token.uid}@users.onstage.local`;
    const handle = await this.uniqueHandle(token.name ?? email.split('@')[0]);

    return this.prisma.user.create({
      data: {
        authUid: token.uid,
        email,
        handle,
        displayName: token.name?.slice(0, 80) ?? handle,
        avatar: token.picture ?? null,
        notificationPrefs: {
          newEventsFromFollowed: true,
          postShowRating: true,
          threadReplies: true,
          email: false,
        },
      },
    });
  }

  private async uniqueHandle(seed: string): Promise<string> {
    const base =
      seed
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '')
        .slice(0, HANDLE_MAX - 5) || 'fan';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${Math.floor(Math.random() * 10_000)}`;
      const taken = await this.prisma.user.findUnique({ where: { handle: candidate } });
      if (!taken) return candidate;
    }
    return `fan${Date.now().toString(36)}`;
  }
}
