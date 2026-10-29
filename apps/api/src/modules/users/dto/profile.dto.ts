import { ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LOCALES, type Locale } from '@onstage/shared';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Granular notification categories. Every field is independently switchable. */
export class NotificationPrefsDto {
  @ApiPropertyOptional({ description: 'An artist you follow announces a show near you.' })
  @IsOptional()
  @IsBoolean()
  newEventAnnounced?: boolean;

  @ApiPropertyOptional({ description: 'Tickets are about to go on sale for a show you saved.' })
  @IsOptional()
  @IsBoolean()
  onSaleReminder?: boolean;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 168,
    description: 'How many hours before the on-sale moment to send the reminder.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  onSaleLeadTimeHours?: number;

  @ApiPropertyOptional({ description: 'A ticket tier for a show you saved got cheaper.' })
  @IsOptional()
  @IsBoolean()
  priceDrop?: boolean;

  @ApiPropertyOptional({ description: 'Weekly digest of shows near you this weekend.' })
  @IsOptional()
  @IsBoolean()
  weekendDigest?: boolean;

  @ApiPropertyOptional({ description: 'Morning-after prompt to rate a show you attended.' })
  @IsOptional()
  @IsBoolean()
  postShowRating?: boolean;

  @ApiPropertyOptional({ description: 'Replies to your thread comments.' })
  @IsOptional()
  @IsBoolean()
  threadReplies?: boolean;

  @ApiPropertyOptional({ description: 'Email as well as push.' })
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Lowercase letters, numbers and underscores.' })
  @IsOptional()
  @Matches(/^[a-z0-9_]{3,30}$/, {
    message: 'Handles are 3-30 characters: lowercase letters, numbers and underscores.',
  })
  handle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  avatar?: string;

  @ApiPropertyOptional({ description: 'Home latitude, used to centre the Near You feed.' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  homeLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  homeLng?: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  homeCity?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, description: 'UI language.' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;

  @ApiPropertyOptional({
    type: NotificationPrefsDto,
    description: 'Merged with existing preferences; omitted keys are left alone.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPrefsDto)
  notificationPrefs?: NotificationPrefsDto;
}

export class PushTokenDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(8)
  token!: string;

  @ApiPropertyOptional({ description: 'ios | android | web' })
  @IsString()
  @MaxLength(16)
  platform!: string;
}
