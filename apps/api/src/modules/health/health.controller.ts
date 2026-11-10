import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CacheService } from '../../common/redis/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('health')
// Container healthchecks and uptime monitors poll this; a 429 would read as an outage.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness and dependency check',
    description:
      'Redis being down is reported but does not fail the check — the API degrades to uncached reads rather than going dark. A database outage answers 503.',
  })
  async check(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.cache.ping()]);
    if (!database) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: database ? 'ok' : 'degraded',
      database: database ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
