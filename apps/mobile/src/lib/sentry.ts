import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/**
 * Crash and error reporting. Off unless EXPO_PUBLIC_SENTRY_DSN is set, so dev
 * builds report nothing by default.
 *
 * Reports carry the error, the device and the screens visited before it — not
 * the person: no user id, email or location, and no request bodies.
 * Coordinates are cut out of every URL a report carries.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

// The feed is fetched with ?lat=&lng=, and request breadcrumbs keep the URL.
const LOCATION_PARAMS = /([?&](?:lat|lng|latitude|longitude)=)[^&#]*/gi;

export function scrubLocation(url: string): string {
  return url.replace(LOCATION_PARAMS, '$1[removed]');
}

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (__DEV__ ? 'development' : 'production'),
    release: Constants.expoConfig?.version,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeBreadcrumb(breadcrumb) {
      if (typeof breadcrumb.data?.url === 'string') {
        breadcrumb.data.url = scrubLocation(breadcrumb.data.url);
      }
      return breadcrumb;
    },
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubLocation(event.request.url);
      if (event.request?.query_string) delete event.request.query_string;
      return event;
    },
    beforeSendTransaction(event) {
      if (event.transaction) event.transaction = scrubLocation(event.transaction);
      for (const span of event.spans ?? []) {
        if (span.description) span.description = scrubLocation(span.description);
        if (typeof span.data?.url === 'string') span.data.url = scrubLocation(span.data.url);
      }
      return event;
    },
  });
}

export { Sentry };
