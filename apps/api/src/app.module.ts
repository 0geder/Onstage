import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AuthModule } from './common/auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { CacheModule } from './common/redis/cache.module';
import { AdminModule } from './modules/admin/admin.module';
import { ArtistsModule } from './modules/artists/artists.module';
import { BadgesModule } from './modules/badges/badges.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ConsentModule } from './modules/consent/consent.module';
import { EventsModule } from './modules/events/events.module';
import { FeedModule } from './modules/feed/feed.module';
import { HealthModule } from './modules/health/health.module';
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
    // rating — live in the services that own those rules.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CacheModule,
    AuthModule,
    NotificationsModule,
    HealthModule,
    ArtistsModule,
    EventsModule,
    TicketsModule,
    SearchModule,
    SitemapModule,
    FeedModule,
    CommentsModule,
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
