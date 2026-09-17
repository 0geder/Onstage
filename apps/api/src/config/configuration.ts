/**
 * Every external credential comes from the environment. Nothing is committed,
 * and every provider block is optional — a missing key disables that adapter
 * rather than crashing the service.
 */
import { DEFAULT_UTM, type AffiliateConfig } from '@onstage/shared';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  baseUrl: string;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string;
  auth: {
    mode: 'dev' | 'firebase';
    firebase: {
      projectId?: string;
      clientEmail?: string;
      privateKey?: string;
    };
  };
  adminApiToken: string;
  maps: { googleApiKey?: string };
  cdnBaseUrl: string;
  /** Canonical public website, used for share links, sitemaps and JSON-LD. */
  webBaseUrl: string;
  /** Null disables affiliate tagging entirely; links go out untouched. */
  affiliate: AffiliateConfig | null;
  /** Bumped whenever the privacy policy changes, and stored with each consent. */
  privacyPolicyVersion: string;
}

/**
 * Per-provider affiliate parameter names, supplied as JSON so a new programme
 * is a configuration change rather than a deploy:
 *   AFFILIATE_PARAMS={"quicket":"ref","ticketmaster":"camefrom"}
 */
function parseAffiliate(): AffiliateConfig | null {
  const affiliateId = process.env.AFFILIATE_ID;
  if (!affiliateId) return null;

  let parameters: AffiliateConfig['parameters'] = {};
  if (process.env.AFFILIATE_PARAMS) {
    try {
      parameters = JSON.parse(process.env.AFFILIATE_PARAMS) as AffiliateConfig['parameters'];
    } catch {
      // A malformed mapping disables tagging rather than corrupting checkout URLs.
      return null;
    }
  }

  return { affiliateId, parameters, common: DEFAULT_UTM };
}

function parseOrigins(raw?: string): string[] {
  if (!raw) return ['*'];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 3000),
  baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  auth: {
    mode: process.env.AUTH_MODE === 'firebase' ? 'firebase' : 'dev',
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Private keys are pasted with literal \n escapes; restore real newlines.
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'),
    },
  },
  adminApiToken: process.env.ADMIN_API_TOKEN ?? '',
  maps: { googleApiKey: process.env.GOOGLE_MAPS_API_KEY },
  cdnBaseUrl: process.env.CDN_BASE_URL ?? '',
  webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:3002',
  affiliate: parseAffiliate(),
  privacyPolicyVersion: process.env.PRIVACY_POLICY_VERSION ?? '2026-01-01',
});
