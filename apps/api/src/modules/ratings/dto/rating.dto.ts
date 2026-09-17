import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitRatingDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Optional short review.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewText?: string;
}
