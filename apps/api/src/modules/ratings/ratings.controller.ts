import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SubmitRatingDto } from './dto/rating.dto';
import { RatingsService } from './ratings.service';

@ApiTags('ratings')
@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Put('artists/:id/rating')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rate an artist overall',
    description:
      'One rating per user per artist, editable. Requires an account at least 24 hours old.',
  })
  rateArtist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitRatingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ratings.rateArtist(user, id, body);
  }

  @Put('events/:id/rating')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rate a live performance',
    description:
      'Only available to users confirmed as having attended, and only after the show. Kept separate from the overall rating on the profile.',
  })
  rateLive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitRatingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ratings.rateLivePerformance(user, id, body);
  }

  @Get('artists/:id/reviews')
  @ApiOperation({ summary: 'Written reviews for an artist' })
  reviews(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.ratings.listForArtist(id, query.limit);
  }

  @Get('me/ratings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Your ratings' })
  mine(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthUser) {
    return this.ratings.mine(user.id, query.limit);
  }

  @Delete('ratings/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a rating' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.ratings.remove(user, id);
  }
}
