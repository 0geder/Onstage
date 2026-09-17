import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { COMMENT_SORTS, COMMENT_TAGS, COMMENT_THREADS, REPORT_REASONS } from '@onstage/shared';
import type { CommentSort, CommentTag, CommentThread, ReportReason } from '@onstage/shared';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ThreadQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: COMMENT_TAGS,
    description: 'Filter chip. `have_tickets` is what the sold-out call to action links into.',
  })
  @IsOptional()
  @IsIn(COMMENT_TAGS)
  tag?: CommentTag;

  @ApiPropertyOptional({ enum: COMMENT_SORTS, default: 'top' })
  @IsOptional()
  @IsIn(COMMENT_SORTS)
  sort: CommentSort = 'top';

  @ApiPropertyOptional({
    enum: COMMENT_THREADS,
    default: 'planning',
    description: 'The recap thread stays locked until the show has started.',
  })
  @IsOptional()
  @IsIn(COMMENT_THREADS)
  thread: CommentThread = 'planning';
}

export class CreateCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ enum: COMMENT_TAGS, default: 'none' })
  @IsOptional()
  @IsIn(COMMENT_TAGS)
  tag: CommentTag = 'none';

  @ApiPropertyOptional({
    description: 'Reply target. Replies to a reply attach to the same root comment.',
  })
  @IsOptional()
  @IsUUID()
  parentCommentId?: string;

  @ApiPropertyOptional({ enum: COMMENT_THREADS, default: 'planning' })
  @IsOptional()
  @IsIn(COMMENT_THREADS)
  thread: CommentThread = 'planning';
}

export class ReportCommentDto {
  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
