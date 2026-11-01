import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { ArtistClaimsService } from './artist-claims.service';
import { CreateArtistClaimDto } from './dto/artist-claim.dto';

@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ArtistClaimsController {
  constructor(private readonly claims: ArtistClaimsService) {}

  @Post('artists/:id/claims')
  @ApiTags('artists')
  // Every claim is read by a person, so a handful an hour is plenty for a
  // real artist and keeps the review queue from being flooded.
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @ApiOperation({
    summary: 'Claim this artist profile',
    description:
      'Asks an Onstage operator to verify that you are the artist or act for them. Refused with 409 once the profile has an approved claim, or while your own claim is pending. A rejected claim can be resubmitted.',
  })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateArtistClaimDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.claims.create(user, id, { evidence: body.evidence, contactUrl: body.contactUrl });
  }

  @Get('me/artist-claims')
  @ApiTags('me')
  @ApiOperation({ summary: 'Your artist profile claims and where each one stands' })
  mine(@CurrentUser() user: AuthUser) {
    return this.claims.listForUser(user.id);
  }
}
