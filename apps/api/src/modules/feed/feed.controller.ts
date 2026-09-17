import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { DiscoveryQueryDto, NearbyQueryDto } from './dto/feed.query';
import { FeedService } from './feed.service';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: 'Discovery feed',
    description:
      'Near You, From Artists You Follow and This Weekend in one response. Sections that cannot be built — no location, not signed in — come back empty rather than failing the request.',
  })
  discovery(@Query() query: DiscoveryQueryDto, @CurrentUser() user?: AuthUser) {
    return this.feed.discovery(user, query);
  }

  @Get('nearby')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: 'Paged events within a radius',
    description: 'PostGIS radius search ordered by date, with the distance in kilometres.',
  })
  async nearby(@Query() query: NearbyQueryDto, @CurrentUser() user?: AuthUser) {
    const centre =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : await this.feed.homeLocation(user);

    if (!centre) {
      throw new BadRequestException(
        'Pass lat and lng, or save a home location on your profile first.',
      );
    }

    return this.feed.nearby(centre, query.radiusKm, query.genres, query.limit, query.cursor);
  }
}
