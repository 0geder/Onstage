import { Module } from '@nestjs/common';
import { HowlerController } from './howler.controller';
import { HowlerService } from './howler.service';

/** Inbound pushes from ticketing partners. */
@Module({ controllers: [HowlerController], providers: [HowlerService] })
export class IntegrationsModule {}
