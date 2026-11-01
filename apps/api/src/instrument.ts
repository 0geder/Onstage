import * as Sentry from '@sentry/nestjs';

/**
 * Error reporting. Imported first in main.ts, because Sentry instruments
 * modules as they load and anything imported earlier is invisible to it.
 *
 * Off unless SENTRY_DSN is set, so local runs and tests report nothing. No
 * personal data leaves the server: no IPs, cookies or bearer tokens.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // Only what a bug report needs: no user details, cookies, bodies or
    // bearer tokens, and no coordinates from the feed's query string.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { allow: ['user-agent', 'content-type', 'accept-language'] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: { deny: ['lat', 'lng', 'email'] },
    },
    // A sample of requests for timing; errors are always sent.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}
