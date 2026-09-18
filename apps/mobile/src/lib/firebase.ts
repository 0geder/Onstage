import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
// The `firebase` wrapper package's own `./auth` export map has no
// "react-native" condition — only its underlying `@firebase/auth` package
// does. `getReactNativePersistence` is only reachable by importing that
// package directly (pinned as a dependency to match the version `firebase`
// itself bundles). See the customConditions note in tsconfig.json for the
// type-checking half of this.
import { getReactNativePersistence, initializeAuth, type Auth } from '@firebase/auth';

/**
 * Firebase client bootstrap.
 *
 * This config is the public, client-side half of the pair — safe to ship in
 * the app binary, unlike the Admin SDK credentials the API holds server-side.
 * The two are independent: this file only ever talks to Firebase Auth to
 * obtain an ID token, which the API then verifies against its own Admin SDK
 * credentials. Neither side trusts the other without that verification step.
 *
 * `initializeAuth` with `getReactNativePersistence` (rather than the default
 * `getAuth`) is required in React Native — without it, sign-in state does not
 * survive an app restart and silently falls back to in-memory-only persistence.
 */

function readConfig(): FirebaseOptions | null {
  const apiKey =
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ??
    (Constants.expoConfig?.extra?.firebaseApiKey as string | undefined);
  const projectId =
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ??
    (Constants.expoConfig?.extra?.firebaseProjectId as string | undefined);
  const appId =
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??
    (Constants.expoConfig?.extra?.firebaseAppId as string | undefined);

  if (!apiKey || !projectId || !appId) return null;

  return {
    apiKey,
    projectId,
    appId,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}

const config = readConfig();

/** True once EXPO_PUBLIC_FIREBASE_* is actually configured. Screens check this before rendering sign-in. */
export const firebaseConfigured = config !== null;

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!config) {
    throw new Error(
      'Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_API_KEY, EXPO_PUBLIC_FIREBASE_PROJECT_ID ' +
        'and EXPO_PUBLIC_FIREBASE_APP_ID — see .env.example.',
    );
  }

  if (!authInstance) {
    const app = getApps()[0] ?? initializeApp(config);
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }

  return authInstance;
}
