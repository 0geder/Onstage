import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SearchService } from './search.service';

export class SearchQueryDto {
  @ApiPropertyOptional({ description: 'Free text: artist name, alias or genre.' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('artists')
  @ApiOperation({
    summary: 'Search artists',
    description:
      'Typo-tolerant across names, aliases, genres and home city. Each result carries the next upcoming show so the result itself is actionable.',
  })
  artists(@Query() query: SearchQueryDto) {
    return this.search.searchArtists(query.q, query.limit);
  }
}
