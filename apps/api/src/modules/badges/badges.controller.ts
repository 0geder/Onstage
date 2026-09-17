import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { BadgesService } from './badges.service';

@ApiTags('badges')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me/badges')
export class BadgesController {
  constructor(private readonly badges: BadgesService) {}

  @Get()
  @ApiOperation({
    summary: 'Your attendance streak and badges',
    description:
      'A streak is consecutive calendar months with at least one attended show. Reading this also awards any badge newly earned.',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.badges.syncBadges(user.id);
  }
}
