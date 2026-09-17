import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// The worker runs standalone, so it loads the repo-root .env itself.
loadEnv({ path: resolve(__dirname, '../../../.env') });
loadEnv();

export interface ProviderConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  appId?: string;
}

export interface WorkerConfig {
  ingestionEnabled: boolean;
  hotCron: string;
  coldCron: string;
  notificationsCron: string;
  /** Requests per second against any single provider. */
  rateLimitPerSecond: number;
  requestTimeoutMs: number;
  /** Two events match if their venues are within this distance. */
  dedupeRadiusMetres: number;
  /** ...and their start times are within this many hours. */
  dedupeWindowHours: number;
  markets: string[];
  providers: {
    bandsintown: ProviderConfig;
    songkick: ProviderConfig;
    ticketmaster: ProviderConfig;
    quicket: ProviderConfig;
  };
}

export const config: WorkerConfig = {
  ingestionEnabled: process.env.INGESTION_ENABLED !== 'false',
  hotCron: process.env.INGESTION_HOT_CRON ?? '0 * * * *',
  coldCron: process.env.INGESTION_COLD_CRON ?? '0 4 * * *',
  notificationsCron: process.env.NOTIFICATIONS_CRON ?? '*/5 * * * *',
  rateLimitPerSecond: Number(process.env.INGESTION_RATE_LIMIT ?? 4),
  requestTimeoutMs: Number(process.env.INGESTION_TIMEOUT_MS ?? 15_000),
  dedupeRadiusMetres: Number(process.env.DEDUPE_RADIUS_METRES ?? 500),
  dedupeWindowHours: Number(process.env.DEDUPE_WINDOW_HOURS ?? 24),
  markets: (process.env.INGESTION_MARKETS ?? 'ZA').split(',').map((m) => m.trim()),
  providers: {
    bandsintown: {
      // A provider with no credential is simply skipped. Missing keys must never
      // crash a run — the other sources still have work to do.
      enabled: Boolean(process.env.BANDSINTOWN_APP_ID),
      baseUrl: process.env.BANDSINTOWN_BASE_URL ?? 'https://rest.bandsintown.com',
      appId: process.env.BANDSINTOWN_APP_ID,
    },
    songkick: {
      enabled: Boolean(process.env.SONGKICK_API_KEY),
      baseUrl: process.env.SONGKICK_BASE_URL ?? 'https://api.songkick.com/api/3.0',
      apiKey: process.env.SONGKICK_API_KEY,
    },
    ticketmaster: {
      enabled: Boolean(process.env.TICKETMASTER_API_KEY),
      baseUrl: process.env.TICKETMASTER_BASE_URL ?? 'https://app.ticketmaster.com/discovery/v2',
      apiKey: process.env.TICKETMASTER_API_KEY,
    },
    quicket: {
      enabled: Boolean(process.env.QUICKET_API_KEY),
      baseUrl: process.env.QUICKET_BASE_URL ?? 'https://api.quicket.co.za/api',
      apiKey: process.env.QUICKET_API_KEY,
    },
  },
};
