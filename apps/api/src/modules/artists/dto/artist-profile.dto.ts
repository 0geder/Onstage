import { ApiPropertyOptional } from '@nestjs/swagger';
import { SOCIAL_PLATFORMS, STREAMING_PLATFORMS } from '@onstage/shared';
import type { SocialLinks, StreamingLinks } from '@onstage/shared';
import { IsObject, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { IsLinkMap } from '../../../common/validation/link-map.validator';

/**
 * Images on a profile an artist edits themselves are https only: they are
 * hot-linked into every client, and a plain-http image is mixed content on web.
 */
const HTTPS_URL = { protocols: ['https'], require_protocol: true };
const URL_MAX = 2048;

/**
 * What a verified manager may change on their own profile. Name, slug, genres
 * and external IDs stay with operators — they drive search, deduplication and
 * ingestion matching. `null` clears a field; an omitted field is left alone.
 */
export class UpdateArtistProfileDto {
  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  homeCity?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'https only.' })
  @IsOptional()
  @IsUrl(HTTPS_URL)
  @MaxLength(URL_MAX)
  profileImage?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'https only.' })
  @IsOptional()
  @IsUrl(HTTPS_URL)
  @MaxLength(URL_MAX)
  bannerImage?: string | null;

  @ApiPropertyOptional({ description: 'Replaces the whole map. Onstage hosts no audio.' })
  @IsOptional()
  @IsObject()
  @IsLinkMap(STREAMING_PLATFORMS)
  streamingLinks?: StreamingLinks;

  @ApiPropertyOptional({ description: 'Replaces the whole map.' })
  @IsOptional()
  @IsObject()
  @IsLinkMap(SOCIAL_PLATFORMS)
  socialLinks?: SocialLinks;
}
