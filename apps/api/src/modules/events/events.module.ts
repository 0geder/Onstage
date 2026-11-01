import { Module } from '@nestjs/common';
import { ArtistsModule } from '../artists/artists.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [ArtistsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
