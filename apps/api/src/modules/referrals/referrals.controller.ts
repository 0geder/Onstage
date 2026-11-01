import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { ReferralsService } from './referrals.service';

export class RedeemReferralDto {
  @ApiProperty({ description: 'The invite code, case-insensitive.' })
  @IsString()
  @Length(4, 16)
  code!: string;
}

@ApiTags('referrals')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me/referral-code')
  @ApiOperation({
    summary: 'Your invite code',
    description: 'Created on first request and permanent thereafter.',
  })
  code(@CurrentUser() user: AuthUser) {
    return this.referrals.codeFor(user.id);
  }

  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @Post('referrals/redeem')
  @ApiOperation({
    summary: 'Redeem an invite code',
    description:
      'One redemption per account, within a few days of signing up. Both sides get early on-sale alerts.',
  })
  redeem(@Body() body: RedeemReferralDto, @CurrentUser() user: AuthUser) {
    return this.referrals.redeem(user.id, body.code);
  }
}
