import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminTokenGuard } from '../../common/auth/admin-token.guard';
import { TicketsService } from '../tickets/tickets.service';
import { AdminService } from './admin.service';
import {
  BanUserDto,
  CreateArtistDto,
  CreateEventDto,
  CreateVenueDto,
  ModerateCommentDto,
  SetLineupDto,
  SetTicketOptionsDto,
  UpdateArtistDto,
  UpdateEventDto,
} from './dto/admin.dto';

/**
 * Admin and curation surface, guarded by a shared token held by the CMS process.
 *
 * Coverage of the local scene is the product, not a back-office chore — this is
 * where a launch city's calendar actually gets built.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminTokenGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly tickets: TicketsService,
  ) {}

  // ── Artists ──

  @Post('artists')
  @ApiOperation({ summary: 'Create an artist' })
  createArtist(@Body() body: CreateArtistDto) {
    return this.admin.createArtist(body);
  }

  @Patch('artists/:id')
  @ApiOperation({ summary: 'Update an artist' })
  updateArtist(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateArtistDto) {
    return this.admin.updateArtist(id, body);
  }

  // ── Venues ──

  @Get('venues')
  @ApiOperation({ summary: 'List or search venues' })
  listVenues(@Query('search') search?: string, @Query('limit') limit = '50') {
    return this.admin.listVenues(search, Number(limit));
  }

  @Post('venues')
  @ApiOperation({
    summary: 'Create a venue',
    description:
      'Accessibility and logistics fields are optional; leaving one null means "unknown", which the app renders differently from "no".',
  })
  createVenue(@Body() body: CreateVenueDto) {
    return this.admin.createVenue(body);
  }

  @Patch('venues/:id')
  @ApiOperation({ summary: 'Update a venue' })
  updateVenue(@Param('id', ParseUUIDPipe) id: string, @Body() body: Partial<CreateVenueDto>) {
    return this.admin.updateVenue(id, body);
  }

  // ── Events ──

  @Get('events')
  @ApiOperation({ summary: 'List events for curation' })
  listEvents(
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('limit') limit = '50',
    @Query('upcoming') upcoming = 'true',
  ) {
    return this.admin.listEvents({
      search,
      city,
      limit: Number(limit),
      upcoming: upcoming !== 'false',
    });
  }

  @Post('events')
  @ApiOperation({
    summary: 'Create an event manually',
    description:
      'Written with source `manual` and locked by default, so an ingestion run can never overwrite curated work.',
  })
  createEvent(@Body() body: CreateEventDto) {
    return this.admin.createEvent(body);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Update an event' })
  updateEvent(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateEventDto) {
    return this.admin.updateEvent(id, body);
  }

  @Delete('events/:id')
  @ApiOperation({ summary: 'Delete an event' })
  deleteEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deleteEvent(id);
  }

  @Put('events/:id/lineup')
  @ApiOperation({
    summary: 'Replace the lineup',
    description: 'Billing order is explicit; every entry links to a real artist profile.',
  })
  setLineup(@Param('id', ParseUUIDPipe) id: string, @Body() body: SetLineupDto) {
    return this.admin.setLineup(id, body);
  }

  @Put('events/:id/tickets')
  @ApiOperation({ summary: 'Replace the ticket options' })
  setTickets(@Param('id', ParseUUIDPipe) id: string, @Body() body: SetTicketOptionsDto) {
    return this.admin.setTicketOptions(id, body);
  }

  // ── Paid placement ──

  @Put('artists/:id/promotion')
  @ApiOperation({
    summary: 'Set or clear paid placement on an artist',
    description:
      'Display and ranking only. Billing is deliberately out of scope — nothing here charges anyone.',
  })
  promoteArtist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isPromoted: boolean; promotedUntil?: string },
  ) {
    return this.admin.setPromotion('artist', id, body.isPromoted, body.promotedUntil);
  }

  @Put('events/:id/promotion')
  @ApiOperation({ summary: 'Set or clear paid placement on an event' })
  promoteEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isPromoted: boolean; promotedUntil?: string },
  ) {
    return this.admin.setPromotion('event', id, body.isPromoted, body.promotedUntil);
  }

  // ── Moderation ──

  @Get('moderation/queue')
  @ApiOperation({
    summary: 'Reported and auto-flagged comments',
    description: 'Worst scam score first. Nothing is ever removed without a human deciding.',
  })
  queue(@Query('limit') limit = '50') {
    return this.admin.moderationQueue(Number(limit));
  }

  @Post('moderation/comments/:id')
  @ApiOperation({ summary: 'Hide or restore a comment' })
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() body: ModerateCommentDto) {
    return this.admin.moderateComment(id, body.action, null, body.resolution);
  }

  @Post('moderation/users/:id/ban')
  @ApiOperation({ summary: 'Ban an account and hide its posts' })
  ban(@Param('id', ParseUUIDPipe) id: string, @Body() body: BanUserDto) {
    return this.admin.banUser(id, body.reason);
  }

  @Delete('moderation/users/:id/ban')
  @ApiOperation({ summary: 'Lift a ban' })
  unban(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.unbanUser(id);
  }

  // ── Operational visibility ──

  @Get('ingestion/runs')
  @ApiOperation({ summary: 'Recent ingestion runs' })
  runs(@Query('limit') limit = '30') {
    return this.admin.ingestionRuns(Number(limit));
  }

  @Get('coverage')
  @ApiOperation({
    summary: 'Coverage by city',
    description:
      'Upcoming events per city and how many came from a human. A city with almost no manual entries has not really been launched.',
  })
  coverage() {
    return this.admin.coverage();
  }

  @Get('anomalies/ratings')
  @ApiOperation({ summary: 'Possible review bombing' })
  anomalies(@Query('hours', new ParseIntPipe({ optional: true })) hours = 24) {
    return this.admin.ratingAnomalies(hours);
  }

  @Get('reports/ticket-clicks')
  @ApiOperation({
    summary: 'Outbound ticket clicks by provider',
    description: 'The affiliate-side number. No payment passes through Onstage.',
  })
  ticketClicks(@Query('days', new ParseIntPipe({ optional: true })) days = 30) {
    return this.tickets.clickReport(days);
  }

  @Get('deletion-requests')
  @ApiOperation({
    summary: 'Pending POPIA deletion requests',
    description: 'Oldest first — these have a 30-day clock on them.',
  })
  deletionRequests() {
    return this.admin.pendingDeletionRequests();
  }
}
