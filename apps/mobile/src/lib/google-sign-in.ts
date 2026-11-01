import Constants from 'expo-constants';
import { AuthRequest, exchangeCodeAsync, makeRedirectUri, ResponseType } from 'expo-auth-session';
import { discovery } from 'expo-auth-session/providers/google';
import { Platform } from 'react-native';

/**
 * Google sign-in through the browser, returning a Google ID token for Firebase.
 *
 * This deliberately avoids expo-auth-session's `useIdTokenAuthRequest` hook.
 * The hook keeps the request (and its CSRF state and PKCE verifier) in the
 * screen's state, and the sign-in screen can be rebuilt while the user is on
 * Google's page — the redirect back into the app resets navigation. The
 * rebuilt screen then holds a fresh request, Google's reply no longer matches
 * it, and sign-in fails with "state_mismatch". Holding the request in this
 * function instead means a rebuilt screen cannot lose it.
 */

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

function clientId(): string | undefined {
  return Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}

export function googleSignInConfigured(): boolean {
  return Boolean(clientId());
}

/** The app's own id, which is the scheme Google redirects native clients to. */
function applicationId(): string {
  const config = Constants.expoConfig;
  const id = Platform.OS === 'ios' ? config?.ios?.bundleIdentifier : config?.android?.package;
  if (!id) throw new Error('Google sign-in is not set up for this build.');
  return id;
}

/** Null when the person closed the browser without signing in. */
export async function promptGoogleIdToken(): Promise<string | null> {
  const id = clientId();
  if (!id) throw new Error('Google sign-in is not set up for this build.');
  const redirectUri = makeRedirectUri({ native: `${applicationId()}:/oauthredirect` });

  // Installed apps use the code flow with PKCE; no client secret is involved.
  const request = new AuthRequest({
    clientId: id,
    redirectUri,
    scopes: SCOPES,
    responseType: ResponseType.Code,
    usePKCE: true,
  });
  // In the app's own task, not a separate one: a separate browser task
  // outlives an abandoned attempt, and Android then reuses it — showing the
  // old request, whose reply no longer matches.
  const result = await request.promptAsync(discovery, { createTask: false });

  if (result.type === 'cancel' || result.type === 'dismiss') return null;
  if (result.type !== 'success') {
    throw new Error(
      result.type === 'error'
        ? (result.error?.message ?? 'Google sign-in failed.')
        : 'Google sign-in failed.',
    );
  }

  const tokens = await exchangeCodeAsync(
    {
      clientId: id,
      code: result.params.code ?? '',
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  );
  if (!tokens.idToken) throw new Error('Google did not return an ID token.');
  return tokens.idToken;
}
