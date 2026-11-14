import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { BlocksService } from './blocks.service';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me/blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  @ApiOperation({ summary: 'People you have blocked', description: 'Most recent first.' })
  list(@CurrentUser() user: AuthUser) {
    return this.blocks.list(user.id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post(':userId')
  @ApiOperation({
    summary: 'Block someone',
    description:
      'Idempotent. Their comments and replies are hidden from you in every thread. They are not told.',
  })
  block(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser) {
    return this.blocks.block(user.id, userId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Delete(':userId')
  @ApiOperation({ summary: 'Unblock someone', description: 'Idempotent.' })
  unblock(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser) {
    return this.blocks.unblock(user.id, userId);
  }
}
