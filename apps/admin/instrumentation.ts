import * as Sentry from '@sentry/nextjs';

/**
 * Server-side error reporting for the CMS. Off unless SENTRY_DSN is set.
 * Sends the error and the page it happened on, never cookies, bodies or who
 * was signed in.
 */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent', 'accept-language'] }, response: false },
      httpBodies: [],
    },
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}

// Errors thrown while rendering a page or running a server action.
export const onRequestError = Sentry.captureRequestError;
