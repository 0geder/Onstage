import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, OptionalAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ArtistClaimsService } from './artist-claims.service';
import { ArtistEventsQueryDto } from './dto/artist-events.query';
import { UpdateArtistProfileDto } from './dto/artist-profile.dto';
import { ArtistsService } from './artists.service';

@ApiTags('artists')
@Controller('artists')
export class ArtistsController {
  constructor(
    private readonly artists: ArtistsService,
    private readonly claims: ArtistClaimsService,
  ) {}

  @Get(':idOrSlug')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: 'Artist profile',
    description:
      'Accepts a UUID or a slug. Includes both the overall rating and the live performance rating, which are kept separate on purpose. `viewerManages` is true when the signed-in user may edit the profile.',
  })
  async findOne(@Param('idOrSlug') idOrSlug: string, @CurrentUser() user?: AuthUser) {
    const artist = await this.artists.findOne(idOrSlug);
    const [viewerIsFollowing, viewer] = await Promise.all([
      user ? this.artists.isFollowing(user.id, artist.id) : false,
      this.claims.viewerState(user, artist.id),
    ]);
    return { ...artist, viewerIsFollowing, ...viewer };
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Edit an artist profile you manage',
    description:
      'Needs an approved claim on the profile. Bio, home city, links and images only; name and genres stay with Onstage operators.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateArtistProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.artists.updateProfile(user, id, body);
  }

  @Get(':id/events')
  @ApiOperation({
    summary: 'Shows this artist appears on',
    description:
      'Includes support and opening slots, not only headline dates. `scope=upcoming` covers announced and confirmed appearances only — Onstage never tracks an artist’s live location.',
  })
  events(@Param('id', ParseUUIDPipe) id: string, @Query() query: ArtistEventsQueryDto) {
    return this.artists.events(id, query.scope, query.limit, query.cursor);
  }

  @Get(':id/similar')
  @ApiOperation({
    summary: 'Similar artists',
    description: 'Ranked by shared bills first, then by genre overlap.',
  })
  similar(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.artists.similar(id, query.limit);
  }

  @Post(':id/follow')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Follow an artist',
    description: 'Idempotent. Subscribes the user to new event announcements in their region.',
  })
  follow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.artists.follow(user.id, id);
  }

  @Delete(':id/follow')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unfollow an artist', description: 'Idempotent.' })
  unfollow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.artists.unfollow(user.id, id);
  }
}
