/**
 * Refuses to start a production API that is missing a secret or still carries
 * a development default. Every problem is collected and reported at once, by
 * variable name only — a value never appears in the message, because startup
 * errors end up in container logs and Sentry.
 *
 * Outside NODE_ENV=production this checks nothing, so local setups keep
 * working with the defaults in .env.example.
 */

/** Values copied from .env.example that must never reach production. */
const DEV_ADMIN_TOKEN = 'change-me-in-every-environment';
const DEV_DATABASE_PASSWORDS = new Set(['onstage', 'postgres', 'password', 'changeme']);
const MIN_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

function blank(value: string | undefined): boolean {
  return !value || value.trim() === '';
}

/** The password in a postgres:// or redis:// URL, or null if it can't be parsed. */
function urlPassword(raw: string): string | null {
  try {
    return decodeURIComponent(new URL(raw).password);
  } catch {
    return null;
  }
}

export function productionConfigProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];

  if (blank(env.DATABASE_URL)) {
    problems.push('DATABASE_URL is not set.');
  } else {
    const password = urlPassword(env.DATABASE_URL!);
    if (password === null) problems.push('DATABASE_URL is not a valid connection URL.');
    else if (password === '' || DEV_DATABASE_PASSWORDS.has(password)) {
      problems.push('DATABASE_URL has an empty or development database password.');
    }
  }

  // The code falls back to localhost, which inside a container is never Redis.
  if (blank(env.REDIS_URL)) problems.push('REDIS_URL is not set.');

  if (env.AUTH_MODE !== undefined && env.AUTH_MODE !== '' && env.AUTH_MODE !== 'firebase') {
    problems.push('AUTH_MODE must be "firebase" (or unset) in production.');
  }
  for (const name of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
    if (blank(env[name])) problems.push(`${name} is not set.`);
  }
  if (!blank(env.FIREBASE_PRIVATE_KEY) && !env.FIREBASE_PRIVATE_KEY!.includes('PRIVATE KEY')) {
    problems.push('FIREBASE_PRIVATE_KEY does not look like a PEM private key.');
  }

  const adminToken = env.ADMIN_API_TOKEN ?? '';
  if (blank(adminToken)) problems.push('ADMIN_API_TOKEN is not set.');
  else if (adminToken === DEV_ADMIN_TOKEN) problems.push('ADMIN_API_TOKEN is still the .env.example placeholder.');
  else if (adminToken.length < MIN_SECRET_LENGTH) {
    problems.push(`ADMIN_API_TOKEN must be at least ${MIN_SECRET_LENGTH} characters.`);
  }

  if (!blank(env.HOWLER_WEBHOOK_TOKEN) && env.HOWLER_WEBHOOK_TOKEN!.length < MIN_SECRET_LENGTH) {
    problems.push(`HOWLER_WEBHOOK_TOKEN must be at least ${MIN_SECRET_LENGTH} characters when set.`);
  }

  const origins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) problems.push('CORS_ORIGINS is not set.');
  else if (origins.some((origin) => !origin.startsWith('https://'))) {
    problems.push('CORS_ORIGINS must list only https:// origins in production.');
  }

  // Behind Caddy the throttler must see the client, not the proxy. Asking for
  // it explicitly stops a forgotten value silently rate-limiting everyone as one IP.
  if (blank(env.TRUST_PROXY)) problems.push('TRUST_PROXY is not set (1 behind a single reverse proxy).');

  return problems;
}

/** Throws one error naming every missing or unsafe variable. */
export function assertProductionConfig(env: Env = process.env): void {
  const problems = productionConfigProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: production configuration is incomplete.\n  - ${problems.join('\n  - ')}`,
    );
  }
}
