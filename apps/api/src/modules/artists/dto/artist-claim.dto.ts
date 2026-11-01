import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export const CLAIM_EVIDENCE_MIN = 20;
export const CLAIM_EVIDENCE_MAX = 2000;

export class CreateArtistClaimDto {
  @ApiProperty({
    minLength: CLAIM_EVIDENCE_MIN,
    maxLength: CLAIM_EVIDENCE_MAX,
    description:
      'Who you are and how an Onstage operator can check it, e.g. "I manage the band; DM us from the official Instagram".',
  })
  @IsString()
  @MinLength(CLAIM_EVIDENCE_MIN)
  @MaxLength(CLAIM_EVIDENCE_MAX)
  evidence!: string;

  @ApiPropertyOptional({
    description: 'An official website or social profile that can confirm the claim.',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  contactUrl?: string;
}
