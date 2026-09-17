import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, OptionalAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { SetAttendanceDto } from './dto/attendance.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get(':idOrSlug')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: 'Event detail',
    description:
      'Poster, lineup in billing order, ticket options with a price range, venue and counts. When status is sold_out the client flips its primary call to action to the thread rather than to a provider.',
  })
  findOne(@Param('idOrSlug') idOrSlug: string, @CurrentUser() user?: AuthUser) {
    return this.events.findOne(idOrSlug, user?.id);
  }

  @Get(':id/travel')
  @ApiOperation({
    summary: 'Directions and ride deep links',
    description:
      'Returns map and rideshare deep links with the venue pre-filled, each with a web fallback. Onstage never books a ride or takes payment.',
  })
  travel(@Param('id', ParseUUIDPipe) id: string) {
    return this.events.travelOptions(id);
  }

  @Get(':id/going')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: 'Who you know is going',
    description:
      'Names only people the viewer follows, flagging mutuals. Everyone else is a count — attendance is not broadcast to strangers.',
  })
  groupPlans(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.events.groupPlans(id, user?.id);
  }

  @Put(':id/attendance')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark yourself interested or going' })
  setAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.events.setAttendance(user.id, id, body.state);
  }

  @Delete(':id/attendance')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear your attendance state' })
  clearAttendance(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.events.clearAttendance(user.id, id);
  }
}
