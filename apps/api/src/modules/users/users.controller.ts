import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AppleSignInService } from './apple-sign-in.service';
import { AppleAuthorizationDto } from './dto/apple-authorization.dto';
import { CompleteOnboardingDto } from './dto/onboarding.dto';
import { PushTokenDto, UpdateProfileDto } from './dto/profile.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly apple: AppleSignInService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Your profile',
    description: 'The first authenticated request also provisions the account.',
  })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update your profile, home location or notification preferences' })
  update(@Body() body: UpdateProfileDto, @CurrentUser() user: AuthUser) {
    return this.users.updateProfile(user.id, body);
  }

  @Post('onboarding')
  @ApiOperation({
    summary: 'Complete onboarding',
    description:
      'Records genre picks and follows at least three artists before the user reaches the discovery feed, so Near You and Following are never empty on first open.',
  })
  onboard(@Body() body: CompleteOnboardingDto, @CurrentUser() user: AuthUser) {
    return this.users.completeOnboarding(user.id, body);
  }

  @Get('onboarding/genres')
  @ApiOperation({
    summary: 'Genres to offer during onboarding',
    description: 'Only genres the catalogue actually covers, most represented first.',
  })
  onboardingGenres() {
    return this.users.popularGenres();
  }

  @Get('onboarding/artists')
  @ApiOperation({
    summary: 'Artists to suggest during onboarding',
    description:
      'Artists with upcoming shows, busiest first; any picked genres (comma-separated) rank matching artists higher.',
  })
  onboardingArtists(@Query('genres') genres?: string) {
    const picked = (genres ?? '')
      .split(',')
      .map((genre) => genre.trim())
      .filter(Boolean)
      .slice(0, 20);
    return this.users.suggestedArtists(picked);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('connections/:userId')
  @ApiOperation({
    summary: 'Follow another person',
    description: 'Backs Group Plans: seeing who you know is also going to a show.',
  })
  followUser(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser) {
    return this.users.followUser(user.id, userId);
  }

  @Delete('connections/:userId')
  @ApiOperation({ summary: 'Unfollow another person' })
  unfollowUser(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser) {
    return this.users.unfollowUser(user.id, userId);
  }

  @Get('following')
  @ApiOperation({ summary: 'Artists you follow' })
  following(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthUser) {
    return this.users.following(user.id, query.limit);
  }

  @Get('plans')
  @ApiOperation({ summary: 'Shows you are interested in or going to' })
  plans(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthUser) {
    return this.users.upcomingPlans(user.id, query.limit);
  }

  @Get('pending-ratings')
  @ApiOperation({
    summary: 'Shows you attended but have not rated',
    description: 'What the morning-after push notification links into.',
  })
  pendingRatings(@CurrentUser() user: AuthUser) {
    return this.users.pendingLiveRatings(user);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('push-tokens')
  @ApiOperation({ summary: 'Register a device for push notifications' })
  registerPush(@Body() body: PushTokenDto, @CurrentUser() user: AuthUser) {
    return this.users.registerPushToken(user.id, body.token, body.platform);
  }

  @Delete('push-tokens')
  @ApiOperation({ summary: 'Deregister a device' })
  removePush(@Body() body: PushTokenDto, @CurrentUser() user: AuthUser) {
    return this.users.removePushToken(user.id, body.token);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('apple-authorization')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Register a Sign in with Apple authorization code',
    description:
      'Sent once after an Apple sign-in. The code is exchanged with Apple for a refresh token, kept only so it can be revoked when the account is deleted. Does nothing when the server has no Apple credentials.',
  })
  async appleAuthorization(@Body() body: AppleAuthorizationDto, @CurrentUser() user: AuthUser) {
    await this.apple.storeAuthorization(user.id, body.authorizationCode);
  }
}
