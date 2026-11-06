import {
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../config/configuration';
import { HowlerService } from './howler.service';

/**
 * Receives Howler's Event Webhook.
 *
 * Each organiser selling on Howler can point their event webhook here, with
 * HOWLER_WEBHOOK_TOKEN as its auth header value (sent as
 * X-Howler-Webhook-Token). Their events then appear in Onstage without us
 * reading Howler's website, which their terms forbid.
 */
@ApiExcludeController()
@Controller('integrations/howler')
export class HowlerController {
  constructor(
    private readonly howler: HowlerService,
    private readonly config: ConfigService,
  ) {}

  @Post('events')
  @HttpCode(200)
  async receiveEvent(
    @Headers('x-howler-webhook-token') token: string | undefined,
    @Body() body: unknown,
  ) {
    const settings = this.config.get<AppConfig['howler']>('howler');
    // Not configured: behave as if the route didn't exist.
    if (!settings?.webhookToken) throw new NotFoundException();

    const given = Buffer.from(token ?? '');
    const expected = Buffer.from(settings.webhookToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('Invalid webhook token.');
    }

    return { result: await this.howler.storeEvent(body, settings.organiserIds) };
  }
}
