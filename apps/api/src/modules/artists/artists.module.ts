import { Module } from '@nestjs/common';
import { ArtistClaimsController } from './artist-claims.controller';
import { ArtistClaimsService } from './artist-claims.service';
import { ArtistsController } from './artists.controller';
import { ArtistsService } from './artists.service';

@Module({
  controllers: [ArtistsController, ArtistClaimsController],
  providers: [ArtistsService, ArtistClaimsService],
  exports: [ArtistsService, ArtistClaimsService],
})
export class ArtistsModule {}
