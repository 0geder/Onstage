import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional } from 'class-validator';
import { OptionalAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { TicketsService } from './tickets.service';

export class TicketClickDto {
  @ApiPropertyOptional({
    enum: ['app', 'web', 'share'],
    default: 'app',
    description: 'Which surface sent the click.',
  })
  @IsOptional()
  @IsIn(['app', 'web', 'share'])
  surface: 'app' | 'web' | 'share' = 'app';
}

@ApiTags('tickets')
@Controller('events/:eventId/tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post(':optionId/click')
  @UseGuards(OptionalAuthGuard)
  // Clicks can be anonymous and feed the affiliate report, so they get a much
  // tighter per-IP limit than the global default to keep the numbers honest.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Open a ticket option',
    description:
      'Records the hand-off for affiliate attribution and returns the provider URL to open in an in-app browser. Onstage never processes the payment.',
  })
  click(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: TicketClickDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.tickets.trackClick(eventId, optionId, user?.id, body.surface);
  }
}
