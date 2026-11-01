import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/**
 * Crash and error reporting. Off unless EXPO_PUBLIC_SENTRY_DSN is set, so dev
 * builds report nothing by default.
 *
 * Reports carry the error, the device and the screens visited before it — not
 * the person: no user id, email or location, and no request bodies.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (__DEV__ ? 'development' : 'production'),
    release: Constants.expoConfig?.version,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
