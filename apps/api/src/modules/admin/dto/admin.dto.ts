import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  EVENT_SOURCES,
  EVENT_STATUSES,
  LINEUP_ROLES,
  LIVESTREAM_PLATFORMS,
  SOCIAL_PLATFORMS,
  STREAMING_PLATFORMS,
  TICKET_AVAILABILITIES,
  TICKET_PROVIDERS,
} from '@onstage/shared';
import type {
  EventSourceName,
  EventStatus,
  LineupRole,
  LivestreamLinks,
  SocialLinks,
  StreamingLinks,
  TicketAvailability,
  TicketProvider,
} from '@onstage/shared';
import { Type } from 'class-transformer';
import { IsLinkMap } from '../../../common/validation/link-map.validator';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  IsTimeZone,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Public http(s) URLs only — never javascript:, data: or protocol-relative. */
const HTTP_URL = { protocols: ['https', 'http'], require_protocol: true };
const URL_MAX = 2048;

export class CreateArtistDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Derived from the name when omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional({ description: 'Alternate spellings and stage names, used by search and by ingestion matching.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  aliases?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  genres?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  homeCity?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2, e.g. ZA.' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(URL_MAX)
  profileImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(URL_MAX)
  bannerImage?: string;

  @ApiPropertyOptional({ description: 'Deep links out to the streaming services. Onstage hosts no audio.' })
  @IsOptional()
  @IsObject()
  @IsLinkMap(STREAMING_PLATFORMS)
  streamingLinks?: StreamingLinks;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @IsLinkMap(SOCIAL_PLATFORMS)
  socialLinks?: SocialLinks;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  externalIds?: Record<string, string>;
}

export class UpdateArtistDto extends CreateArtistDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  declare name: string;
}

export class CreateVenueDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  city!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2.' })
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(URL_MAX)
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(URL_MAX)
  website?: string;

  @ApiPropertyOptional({ default: 'Africa/Johannesburg' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  // Accessibility and logistics. Omit a field when it is genuinely unknown —
  // the app shows "not stated" rather than implying a "no".
  @ApiPropertyOptional({ description: 'Leave unset when unknown; do not guess.' })
  @IsOptional()
  @IsBoolean()
  wheelchairAccess?: boolean;

  @ApiPropertyOptional({ description: 'Venue-level age policy, e.g. "18+" or "Under 18s with an adult".' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ageRestriction?: string;

  @ApiPropertyOptional({ description: 'Re-entry policy in plain language.' })
  @IsOptional()
  @IsString()
  reentryPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cloakroom?: boolean;
}

/** Every field optional and still validated — `Partial<>` alone is erased at runtime. */
export class UpdateVenueDto extends PartialType(CreateVenueDto) {}

export class LineupEntryDto {
  @ApiProperty()
  @IsUUID()
  artistId!: string;

  @ApiPropertyOptional({ description: 'Defaults to the array index.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  billingPosition?: number;

  @ApiPropertyOptional({ enum: LINEUP_ROLES })
  @IsOptional()
  @IsIn(LINEUP_ROLES)
  role?: LineupRole;
}

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiProperty()
  @IsUUID()
  primaryArtistId!: string;

  @ApiProperty()
  @IsUUID()
  venueId!: string;

  @ApiProperty({ description: 'ISO 8601 in UTC.' })
  @IsISO8601()
  startsAt!: string;

  @ApiPropertyOptional({ description: 'Defaults to the venue timezone.' })
  @IsOptional()
  @IsTimeZone()
  localTimezone?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 in UTC.' })
  @IsOptional()
  @IsISO8601()
  doorsOpenAt?: string;

  @ApiPropertyOptional({
    description: 'When tickets go on sale. Drives the user-configurable on-sale reminder.',
  })
  @IsOptional()
  @IsISO8601()
  onSaleAt?: string;

  @ApiPropertyOptional({ enum: EVENT_STATUSES })
  @IsOptional()
  @IsIn(EVENT_STATUSES)
  status?: EventStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ageRestriction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(URL_MAX)
  posterImage?: string;

  @ApiPropertyOptional({ enum: EVENT_SOURCES, default: 'manual' })
  @IsOptional()
  @IsIn(EVENT_SOURCES)
  source?: EventSourceName;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(URL_MAX)
  sourceUrl?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Locked events are never overwritten by an ingestion run.',
  })
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @ApiPropertyOptional({ type: [LineupEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineupEntryDto)
  lineup?: LineupEntryDto[];
}

export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  primaryArtistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  venueId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsTimeZone()
  localTimezone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  doorsOpenAt?: string | null;

  @ApiPropertyOptional({ enum: EVENT_STATUSES })
  @IsOptional()
  @IsIn(EVENT_STATUSES)
  status?: EventStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ageRestriction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(HTTP_URL)
  @MaxLength(URL_MAX)
  posterImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  onSaleAt?: string;

  @ApiPropertyOptional({ description: 'Replaces the whole map; {} removes every link.' })
  @IsOptional()
  @IsObject()
  @IsLinkMap(LIVESTREAM_PLATFORMS)
  livestreamLinks?: LivestreamLinks;
}

export class SetLineupDto {
  @ApiProperty({ type: [LineupEntryDto], description: 'Replaces the existing lineup entirely.' })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineupEntryDto)
  entries!: LineupEntryDto[];
}

export class TicketOptionDto {
  @ApiProperty({ enum: TICKET_PROVIDERS })
  @IsIn(TICKET_PROVIDERS)
  provider!: TicketProvider;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  tierName!: string;

  @ApiPropertyOptional({ description: 'Minor units (cents).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @ApiPropertyOptional({ default: 'ZAR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ enum: TICKET_AVAILABILITIES })
  @IsOptional()
  @IsIn(TICKET_AVAILABILITIES)
  availability?: TicketAvailability;

  @ApiProperty({ description: 'The provider checkout URL. Onstage never takes payment.' })
  @IsUrl(HTTP_URL)
  @MaxLength(URL_MAX)
  purchaseUrl!: string;
}

export class SetTicketOptionsDto {
  @ApiProperty({ type: [TicketOptionDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TicketOptionDto)
  options!: TicketOptionDto[];
}

export class ModerateCommentDto {
  @ApiProperty({ enum: ['hide', 'restore'] })
  @IsIn(['hide', 'restore'])
  action!: 'hide' | 'restore';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolution?: string;
}

export class BanUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class SetPromotionDto {
  @ApiProperty()
  @IsBoolean()
  isPromoted!: boolean;

  @ApiPropertyOptional({ description: 'ISO 8601. Omit for an open-ended campaign.' })
  @IsOptional()
  @IsISO8601()
  promotedUntil?: string;
}

// ── Admin list queries. Bounded so a typo cannot ask Postgres for everything. ──

export class AdminLimitQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}

export class AdminVenuesQueryDto extends AdminLimitQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class AdminEventsQueryDto extends AdminVenuesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'true' })
  @IsOptional()
  @IsIn(['true', 'false'])
  upcoming: 'true' | 'false' = 'true';
}

export class AdminRunsQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 30;
}

export class AnomalyQueryDto {
  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 720 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  hours = 24;
}

export class ClickReportQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days = 30;
}
