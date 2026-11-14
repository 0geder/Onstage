import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onIdTokenChanged,
  OAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { clearCache, request, setTokenProvider } from '../api/client';
import { getFirebaseAuth } from './firebase';
import { unregisterPushToken } from './push';

/**
 * Authentication.
 *
 * Every sign-in path here ends the same way: Firebase holds an ID token, and
 * the API client asks it for that token on each request — the bearer token
 * the backend verifies against its own Admin SDK credentials. The app never
 * invents its own session — Firebase is the only source of truth for "who is
 * this".
 */

export class AuthError extends Error {}

/** Firebase's own error codes, translated into copy a user can act on. */
function friendlyMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account already exists with that email. Try signing in instead.';
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/user-not-found':
      return 'No account found with that email.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Check your connection and try again.';
    default:
      return (error as Error)?.message || 'Something went wrong signing you in.';
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  try {
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    if (displayName.trim()) {
      await updateProfile(credential.user, { displayName: displayName.trim() });
    }
    return credential.user;
  } catch (error) {
    throw new AuthError(friendlyMessage(error));
  }
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  try {
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    return credential.user;
  } catch (error) {
    throw new AuthError(friendlyMessage(error));
  }
}

/** Exchanges a Google ID token (from expo-auth-session) for a Firebase session. */
export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(getFirebaseAuth(), credential);
    return result.user;
  } catch (error) {
    throw new AuthError(friendlyMessage(error));
  }
}

export function appleSignInAvailable(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Apple Sign In.
 *
 * Requires a raw nonce hashed with SHA-256: Apple signs the hash, Firebase
 * verifies the request against the raw value, and the mismatch is what stops
 * a replayed Apple credential being reused against a different sign-in
 * attempt. `expo-apple-authentication` is a native module — this only works
 * in a custom dev client / standalone build, not in plain Expo Go.
 */
export async function signInWithApple(): Promise<User> {
  try {
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    const rawNonce = Array.from(randomBytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!appleCredential.identityToken) {
      throw new AuthError('Apple did not return an identity token. Try again.');
    }

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce,
    });
    const result = await signInWithCredential(getFirebaseAuth(), credential);

    if (appleCredential.authorizationCode) {
      registerAppleAuthorization(appleCredential.authorizationCode);
    }

    // Apple only supplies the person's name on the very first authorization —
    // capture it now or it is gone for good.
    const fullName = appleCredential.fullName;
    if (fullName?.givenName && !result.user.displayName) {
      await updateProfile(result.user, {
        displayName: [fullName.givenName, fullName.familyName].filter(Boolean).join(' '),
      });
    }

    return result.user;
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      throw new AuthError('Sign in was cancelled.');
    }
    throw new AuthError(friendlyMessage(error));
  }
}

/**
 * Hands the one-time Apple authorization code to the API, which exchanges it
 * for a refresh token so account deletion can revoke the app's access at Apple
 * (App Store guideline 5.1.1(v)). Fire-and-forget: the code expires in five
 * minutes and a failure here must never get in the way of signing in.
 */
function registerAppleAuthorization(authorizationCode: string): void {
  request('/me/apple-authorization', {
    method: 'POST',
    body: { authorizationCode },
  }).catch(() => undefined);
}

/**
 * Signs out and forgets everything cached for this person, so whoever signs in
 * next on the same device never sees the previous user's data. The caller
 * clears its React Query cache too (see profile screen).
 */
export async function signOutUser(): Promise<void> {
  // Deregister while the token still authenticates the request.
  await unregisterPushToken();
  await signOut(getFirebaseAuth());
  await clearCache().catch(() => undefined);
}

/**
 * Connects the API client to Firebase's session.
 *
 * `getIdToken()` returns Firebase's cached token and refreshes it shortly
 * before expiry, so nothing here has to track tokens itself. `onIdTokenChanged`
 * fires on sign-in, sign-out and each refresh.
 */
export function subscribeToAuthChanges(onChange: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  setTokenProvider(async (forceRefresh) => {
    const user = auth.currentUser;
    return user ? user.getIdToken(forceRefresh) : null;
  });
  const unsubscribe = onIdTokenChanged(auth, (user) => onChange(user));
  return () => {
    unsubscribe();
    setTokenProvider(null);
  };
}
