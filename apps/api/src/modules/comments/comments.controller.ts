import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, OptionalAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CommentsService } from './comments.service';
import { CreateCommentDto, ReportCommentDto, ThreadQueryDto } from './dto/comment.dto';

@ApiTags('threads')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('events/:id/comments')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({
    summary: 'Event thread',
    description:
      'Top-level comments with a preview of their replies, sortable by Top or Newest and filterable by tag. Every response carries the resale warning notice.',
  })
  thread(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ThreadQueryDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.comments.thread(
      id,
      {
        tag: query.tag,
        sort: query.sort,
        limit: query.limit,
        cursor: query.cursor,
        thread: query.thread,
      },
      user,
    );
  }

  @Post('events/:id/comments')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Post to the thread',
    description:
      'Rate limited and scored for scam patterns. Posts over the auto-hide threshold are held for human review rather than published.',
  })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.create(id, user, {
      body: body.body,
      tag: body.tag,
      parentCommentId: body.parentCommentId,
      thread: body.thread,
    });
  }

  @Get('comments/:id/replies')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Replies to a comment' })
  replies(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.comments.replies(id, query.limit, query.cursor, user);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('comments/:id/like')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like a comment', description: 'Idempotent.' })
  like(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.comments.like(id, user.id);
  }

  @Delete('comments/:id/like')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove your like', description: 'Idempotent.' })
  unlike(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.comments.unlike(id, user.id);
  }

  @Delete('comments/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw your comment' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.comments.softDelete(id, user);
  }

  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @Post('comments/:id/report')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Report a comment',
    description: 'Three open reports flag a comment for review immediately.',
  })
  report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReportCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.report(id, user.id, { reason: body.reason, detail: body.detail });
  }
}
