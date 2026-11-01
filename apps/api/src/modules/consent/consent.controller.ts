import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { CONSENT_TYPES, type ConsentType } from '@onstage/shared';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../../common/auth/auth-user';
import { ConsentService } from './consent.service';

export class ConsentEntryDto {
  @ApiProperty({ enum: CONSENT_TYPES })
  @IsIn(CONSENT_TYPES)
  type!: ConsentType;

  @ApiProperty()
  @IsBoolean()
  granted!: boolean;
}

export class RecordConsentDto {
  @ApiProperty({ type: [ConsentEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsentEntryDto)
  entries!: ConsentEntryDto[];

  @ApiPropertyOptional({ description: 'Where consent was captured, e.g. onboarding or settings.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source = 'settings';
}

@ApiTags('privacy')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Get('consents')
  @ApiOperation({
    summary: 'Your consent state',
    description:
      'Every consent type with its current state. `stale` means consent was given against an older privacy policy and must be asked again.',
  })
  current(@CurrentUser() user: AuthUser) {
    return this.consent.current(user.id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('consents')
  @ApiOperation({
    summary: 'Record consent decisions',
    description:
      'Each decision is timestamped against the policy version in force. Withdrawing location consent clears the stored home location; withdrawing push consent removes device tokens.',
  })
  record(@Body() body: RecordConsentDto, @CurrentUser() user: AuthUser) {
    return this.consent.record(user.id, body.entries, body.source);
  }

  @Get('data-export')
  @ApiOperation({
    summary: 'Export everything we hold about you',
    description: 'POPIA data-access request, served inline as JSON.',
  })
  exportData(@CurrentUser() user: AuthUser) {
    return this.consent.exportData(user.id);
  }

  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @Post('deletion-request')
  @ApiOperation({
    summary: 'Request account deletion',
    description:
      'Logs the request and stops all outbound notifications immediately. Removal completes within 30 days.',
  })
  requestDeletion(@CurrentUser() user: AuthUser) {
    return this.consent.requestDeletion(user.id);
  }

  @Delete('deletion-request')
  @ApiOperation({ summary: 'Cancel a pending deletion request' })
  cancelDeletion(@CurrentUser() user: AuthUser) {
    return this.consent.cancelDeletion(user.id);
  }
}
