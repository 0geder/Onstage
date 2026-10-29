import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONSENT_LABELS, CONSENT_TYPES, type ConsentType } from '@onstage/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * POPIA consent and data-subject requests.
 *
 * Two rules shape this code. Consent is recorded, never assumed: an absent
 * record means "not granted", so a user who has said nothing is treated as
 * having declined. And consent is versioned against the policy text in force
 * when it was given, because consent to an older policy is not consent to a
 * newer one.
 *
 * Deletion is a request with a clock on it, not an inline delete — moderation
 * records and an audit trail have to survive long enough to be handled properly.
 */
@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Current state for every consent type, defaulting to not granted. */
  async current(userId: string) {
    const rows = await this.prisma.userConsent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latest.has(row.type)) latest.set(row.type, row);
    }

    const policyVersion = this.config.get<string>('privacyPolicyVersion') ?? '';

    return CONSENT_TYPES.map((type) => {
      const record = latest.get(type);
      return {
        type,
        label: CONSENT_LABELS[type],
        granted: record?.granted ?? false,
        grantedAt: record?.granted ? record.createdAt.toISOString() : null,
        policyVersion: record?.policyVersion ?? null,
        /** True when consent predates the current policy and must be asked again. */
        stale: record ? record.policyVersion !== policyVersion : false,
      };
    });
  }

  async record(
    userId: string,
    entries: { type: ConsentType; granted: boolean }[],
    source: string,
  ) {
    const policyVersion = this.config.get<string>('privacyPolicyVersion') ?? '';

    await this.prisma.userConsent.createMany({
      data: entries.map((entry) => ({
        userId,
        type: entry.type,
        granted: entry.granted,
        source: source.slice(0, 64),
        policyVersion,
      })),
    });

    // Withdrawing location consent clears the stored home location (city too,
    // which is location data in its own right) immediately —
    // consent withdrawn has to mean the data stops being held, not just unused.
    const location = entries.find((entry) => entry.type === 'location');
    if (location && !location.granted) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { homeLat: null, homeLng: null, homeCity: null },
      });
    }

    // Likewise, withdrawing push consent removes the device tokens.
    const push = entries.find((entry) => entry.type === 'push_notifications');
    if (push && !push.granted) {
      await this.prisma.pushToken.deleteMany({ where: { userId } });
    }

    return this.current(userId);
  }

  async hasConsent(userId: string, type: ConsentType): Promise<boolean> {
    const latest = await this.prisma.userConsent.findFirst({
      where: { userId, type },
      orderBy: { createdAt: 'desc' },
      select: { granted: true },
    });
    return latest?.granted ?? false;
  }

  async requestDeletion(userId: string) {
    const requestedAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: requestedAt },
    });

    // Stop everything outbound straight away, even though the rows remain.
    await this.prisma.pushToken.deleteMany({ where: { userId } });
    await this.prisma.notificationOutbox.updateMany({
      where: { userId, status: 'pending' },
      data: { status: 'failed', lastError: 'Account deletion requested' },
    });

    return {
      requestedAt: requestedAt.toISOString(),
      message:
        'Your deletion request has been logged. Your account and personal data will be removed within 30 days, and notifications have stopped already.',
    };
  }

  async cancelDeletion(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    });
    return { cancelled: true };
  }

  /** Everything Onstage holds about a user, for a data-access request. */
  async exportData(userId: string) {
    const [user, follows, attendances, ratings, comments, consents, badges] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.follow.findMany({ where: { userId }, include: { artist: { select: { name: true } } } }),
      this.prisma.attendance.findMany({
        where: { userId },
        include: { event: { select: { title: true, startsAt: true } } },
      }),
      this.prisma.rating.findMany({ where: { userId } }),
      this.prisma.comment.findMany({ where: { userId }, select: { body: true, createdAt: true, eventId: true } }),
      this.prisma.userConsent.findMany({ where: { userId } }),
      this.prisma.userBadge.findMany({ where: { userId } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        handle: user.handle,
        displayName: user.displayName,
        email: user.email,
        homeCity: user.homeCity,
        locale: user.locale,
        createdAt: user.createdAt,
      },
      follows: follows.map((row) => ({ artist: row.artist.name, since: row.createdAt })),
      attendances: attendances.map((row) => ({
        event: row.event.title,
        startsAt: row.event.startsAt,
        state: row.state,
      })),
      ratings,
      comments,
      consents,
      badges,
    };
  }
}
