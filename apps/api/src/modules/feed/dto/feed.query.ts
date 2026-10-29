import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

function csv(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.length > 0) {
    return value.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return undefined;
}

export class DiscoveryQueryDto {
  @ApiPropertyOptional({ description: 'Viewer latitude. Falls back to the saved home location.' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ description: 'Viewer longitude.' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500, description: 'Radius in km.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  radiusKm?: number;

  @ApiPropertyOptional({ description: 'Comma-separated genre filter chips.' })
  @IsOptional()
  @Transform(({ value }) => csv(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  genres?: string[];

  @ApiPropertyOptional({
    default: 'Africa/Johannesburg',
    description: 'IANA timezone deciding what counts as "this weekend".',
  })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}

export class NearbyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  radiusKm = 50;

  @ApiPropertyOptional({ description: 'Comma-separated genre filter chips.' })
  @IsOptional()
  @Transform(({ value }) => csv(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  genres?: string[];
}
