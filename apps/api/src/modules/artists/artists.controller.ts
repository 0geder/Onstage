import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, OptionalAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ArtistEventsQueryDto } from './dto/artist-events.query';
import { ArtistsService } from './artists.service';

@ApiTags('artists')
@Controller('artists')
export class ArtistsController {
  constructor(private readonly artists: ArtistsService) {}

  @Get(':idOrSlug')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: 'Artist profile',
    description:
      'Accepts a UUID or a slug. Includes both the overall rating and the live performance rating, which are kept separate on purpose.',
  })
  async findOne(@Param('idOrSlug') idOrSlug: string, @CurrentUser() user?: AuthUser) {
    const artist = await this.artists.findOne(idOrSlug);
    const viewerIsFollowing = user ? await this.artists.isFollowing(user.id, artist.id) : false;
    return { ...artist, viewerIsFollowing };
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
