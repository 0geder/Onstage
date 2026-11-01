import * as Sentry from '@sentry/node';

/**
 * Error reporting for scheduled jobs, which otherwise fail silently into the
 * log. Off unless SENTRY_DSN is set. Imported first so Sentry can instrument
 * the modules that load after it.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // Jobs handle people's accounts; reports carry the error, not their data.
    dataCollection: { userInfo: false, httpBodies: [] },
    tracesSampleRate: 0,
  });
}

export { Sentry };
