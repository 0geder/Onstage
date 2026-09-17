import { Injectable } from '@nestjs/common';
import { BADGES, badgesForStreak, type BadgeCode } from '@onstage/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

interface MonthRow {
  month: Date;
}

/**
 * Attendance streaks and badges.
 *
 * A streak is consecutive calendar months containing at least one attended
 * show. Months rather than weeks, because a live calendar has quiet stretches
 * and a weekly streak would punish ordinary behaviour — the point is to
 * recognise regulars, not to manufacture anxiety about missing a week.
 *
 * The current month is only counted once it has an attended show in it, so an
 * unbroken streak is never reported as broken part-way through a month.
 */
@Injectable()
export class BadgesService {
  constructor(private readonly prisma: PrismaService) {}

  async streakMonths(userId: string, now = new Date()): Promise<number> {
    const rows = await this.prisma.$queryRaw<MonthRow[]>`
      SELECT DISTINCT date_trunc('month', e.starts_at AT TIME ZONE 'UTC') AS month
      FROM attendances a
      JOIN events e ON e.id = a.event_id
      WHERE a.user_id = ${userId}::uuid
        AND a.state = 'attended'
      ORDER BY month DESC
    `;
    if (rows.length === 0) return 0;

    const months = rows.map((row) => this.monthIndex(row.month));
    const currentMonth = this.monthIndex(now);

    // Anchor on the most recent attended month. If that is neither this month
    // nor last month, the streak has already lapsed.
    const [latest] = months;
    if (currentMonth - latest > 1) return 0;

    let streak = 1;
    for (let i = 1; i < months.length; i += 1) {
      if (months[i - 1] - months[i] === 1) streak += 1;
      else break;
    }
    return streak;
  }

  /**
   * Awards any newly earned badges and returns the user's full badge list.
   * Idempotent: re-running awards nothing twice.
   */
  async syncBadges(userId: string) {
    const streak = await this.streakMonths(userId);
    const earned = badgesForStreak(streak);

    const held = await this.prisma.userBadge.findMany({
      where: { userId },
      select: { code: true },
    });
    const heldCodes = new Set(held.map((badge) => badge.code));
    const fresh = earned.filter((code) => !heldCodes.has(code));

    if (fresh.length > 0) {
      await this.prisma.userBadge.createMany({
        data: fresh.map((code) => ({ userId, code, streakMonths: streak })),
        skipDuplicates: true,
      });
    }

    return { streakMonths: streak, badges: await this.list(userId), newlyAwarded: fresh };
  }

  async list(userId: string) {
    const rows = await this.prisma.userBadge.findMany({
      where: { userId },
      orderBy: { awardedAt: 'asc' },
    });

    return rows.map((row) => ({
      code: row.code as BadgeCode,
      label: BADGES.find((badge) => badge.code === row.code)?.label ?? row.code,
      streakMonths: row.streakMonths,
      awardedAt: row.awardedAt.toISOString(),
    }));
  }

  private monthIndex(date: Date): number {
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
  }
}
