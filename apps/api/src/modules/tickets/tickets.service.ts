import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withAffiliateTag, type AffiliateConfig } from '@onstage/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Outbound ticket links.
 *
 * Onstage takes no payment and holds no funds — the user is handed to the
 * provider's own checkout. What happens here is bookkeeping: a click is recorded
 * so provider commission can be reconciled, and the URL is tagged so the provider
 * can see the referral on their side.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Records the hand-off and returns the URL to open.
   *
   * The click row is written before the URL is returned, so attribution does not
   * depend on the client reporting back after it has already navigated away.
   */
  async trackClick(
    eventId: string,
    ticketOptionId: string,
    userId: string | undefined,
    surface: string,
  ): Promise<{ url: string; clickId: string }> {
    const option = await this.prisma.ticketOption.findFirst({
      where: { id: ticketOptionId, eventId },
    });
    if (!option) throw new NotFoundException('Ticket option not found for this event.');

    const click = await this.prisma.ticketClick.create({
      data: {
        eventId,
        ticketOptionId,
        userId: userId ?? null,
        provider: option.provider,
        surface: surface.slice(0, 24),
      },
      select: { id: true },
    });

    const affiliate = this.config.get<AffiliateConfig | null>('affiliate') ?? null;
    const url = withAffiliateTag(option.purchaseUrl, option.provider, affiliate, {
      eventId,
      ticketOptionId,
      clickId: click.id,
    });

    return { url, clickId: click.id };
  }

  /**
   * Click-through by provider over a window. This is the only revenue-side
   * number Onstage can measure without processing a transaction.
   */
  async clickReport(days: number) {
    return this.prisma.$queryRaw<
      { provider: string; clicks: number; unique_users: number; events: number }[]
    >`
      SELECT provider::text AS provider,
             COUNT(*)::int AS clicks,
             COUNT(DISTINCT user_id)::int AS unique_users,
             COUNT(DISTINCT event_id)::int AS events
      FROM ticket_clicks
      WHERE created_at > NOW() - (${days} * INTERVAL '1 day')
      GROUP BY provider
      ORDER BY clicks DESC
    `;
  }
}
