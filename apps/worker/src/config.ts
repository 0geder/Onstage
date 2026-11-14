import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import type { AppleCredentials } from './apple';

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
  /** IANA zone the cron patterns are read in, so "09:00 Thursday" is local. */
  timezone: string;
  /** Upper bound on a job's runtime; also how long its advisory lock may be held. */
  jobLockMaxMs: number;
  /** How long shutdown waits for running jobs before disconnecting anyway. */
  shutdownTimeoutMs: number;
  accountDeletion: {
    cron: string;
    /** Days between a deletion request and the data actually being removed. */
    graceDays: number;
  };
  /** Firebase Admin credentials, the same ones the API uses. All three or none. */
  firebase?: { projectId: string; clientEmail: string; privateKey: string };
  /**
   * Sign in with Apple credentials, the same ones the API uses, for revoking
   * Apple tokens on account deletion. Absent until team, key id and key are set.
   */
  apple?: AppleCredentials;
  providers: {
    bandsintown: ProviderConfig;
    songkick: ProviderConfig;
    ticketmaster: ProviderConfig;
    quicket: ProviderConfig;
    /** Pushed, not fetched: on with the API's webhook token; reads howler_events. */
    howler: { enabled: boolean };
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
  timezone: process.env.WORKER_TIMEZONE ?? 'Africa/Johannesburg',
  jobLockMaxMs: Number(process.env.JOB_MAX_RUNTIME_MS ?? 2 * 3_600_000),
  shutdownTimeoutMs: Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS ?? 25_000),
  accountDeletion: {
    cron: process.env.ACCOUNT_DELETION_CRON ?? '30 3 * * *',
    // The app promises removal "within 30 days"; a week leaves room to cancel.
    graceDays: Number(process.env.DELETION_GRACE_DAYS ?? 7),
  },
  firebase:
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
      ? {
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Private keys are pasted with literal \n escapes; restore real newlines.
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }
      : undefined,
  apple:
    process.env.APPLE_TEAM_ID?.trim() &&
    process.env.APPLE_KEY_ID?.trim() &&
    process.env.APPLE_PRIVATE_KEY?.trim()
      ? {
          teamId: process.env.APPLE_TEAM_ID.trim(),
          keyId: process.env.APPLE_KEY_ID.trim(),
          privateKey: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientId: process.env.APPLE_CLIENT_ID?.trim() || 'za.co.onstage',
        }
      : undefined,
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
    howler: { enabled: Boolean(process.env.HOWLER_WEBHOOK_TOKEN) },
  },
};
