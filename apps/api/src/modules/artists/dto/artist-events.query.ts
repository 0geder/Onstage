import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ArtistEventsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past'], default: 'upcoming' })
  @IsOptional()
  @IsIn(['upcoming', 'past'])
  scope: 'upcoming' | 'past' = 'upcoming';
}
