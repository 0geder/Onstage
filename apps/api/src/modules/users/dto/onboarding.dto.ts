import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LOCALES, type Locale } from '@onstage/shared';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CompleteOnboardingDto {
  @ApiProperty({
    type: [String],
    description: 'Genres the user picked. Used to seed the discovery feed filters.',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  genres!: string[];

  @ApiProperty({
    type: [String],
    description: 'At least three artists, so the feed is never empty on first open.',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(3)
  @ArrayMaxSize(50)
  artistIds!: string[];

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;
}
