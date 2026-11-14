import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AuthModule } from './common/auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { CacheModule } from './common/redis/cache.module';
import { CacheService } from './common/redis/cache.service';
import { RedisThrottlerStorage } from './common/redis/redis-throttler.storage';
import { AdminModule } from './modules/admin/admin.module';
import { ArtistsModule } from './modules/artists/artists.module';
import { BadgesModule } from './modules/badges/badges.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ConsentModule } from './modules/consent/consent.module';
import { EventsModule } from './modules/events/events.module';
import { FeedModule } from './modules/feed/feed.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { SearchModule } from './modules/search/search.module';
import { SitemapModule } from './modules/sitemap/sitemap.controller';
import { TicketsModule } from './modules/tickets/tickets.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // Coarse per-IP limit. The fine-grained limits that matter — posting,
    // rating — live in the services that own those rules. Counted in Redis so
    // the limit holds across replicas.
    ThrottlerModule.forRootAsync({
      imports: [CacheModule],
      inject: [CacheService],
      useFactory: (cache: CacheService) => ({
        throttlers: [{ ttl: 60_000, limit: 300 }],
        storage: new RedisThrottlerStorage(cache),
      }),
    }),
    PrismaModule,
    CacheModule,
    AuthModule,
    NotificationsModule,
    HealthModule,
    IntegrationsModule,
    ArtistsModule,
    EventsModule,
    TicketsModule,
    SearchModule,
    SitemapModule,
    FeedModule,
    CommentsModule,
    BlocksModule,
    RatingsModule,
    UsersModule,
    ReferralsModule,
    BadgesModule,
    ConsentModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
