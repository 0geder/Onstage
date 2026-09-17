import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Sitemap feeds for the public website.
 *
 * Deliberately minimal — slug and timestamp only. The website is a pure API
 * consumer with no database access of its own, and a sitemap does not need
 * anything more than what a crawler will act on.
 */
@ApiTags('sitemap')
@Controller('sitemap')
export class SitemapController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('artists')
  @ApiOperation({ summary: 'Artist slugs for the sitemap' })
  async artists() {
    const rows = await this.prisma.artist.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      // Sitemaps cap at 50k URLs; split into an index before approaching that.
      take: 45_000,
    });
    return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
  }

  @Get('events')
  @ApiOperation({
    summary: 'Event slugs for the sitemap',
    description:
      'Includes past events: they carry the artist’s history and the recap thread, so they stay worth indexing.',
  })
  async events() {
    const rows = await this.prisma.event.findMany({
      where: { status: { not: 'cancelled' } },
      select: { slug: true, updatedAt: true, startsAt: true },
      orderBy: { startsAt: 'desc' },
      take: 45_000,
    });
    return rows.map((row) => ({
      slug: row.slug,
      updatedAt: row.updatedAt.toISOString(),
      startsAt: row.startsAt.toISOString(),
    }));
  }
}

@Module({ controllers: [SitemapController] })
export class SitemapModule {}
