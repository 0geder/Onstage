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
import { setToken } from '../api/client';
import { getFirebaseAuth } from './firebase';

/**
 * Authentication.
 *
 * Every sign-in path here ends the same way: Firebase issues an ID token, and
 * `setToken` hands it to the API client as the bearer token the backend
 * verifies against its own Admin SDK credentials. The app never invents its
 * own session — Firebase is the only source of truth for "who is this".
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

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
  await setToken(null);
}

/**
 * Keeps the API client's bearer token in sync with Firebase's own session.
 *
 * `onIdTokenChanged` fires on sign-in, sign-out, and on Firebase's automatic
 * hourly token refresh — subscribing to it here means the app never has to
 * remember to refresh anything itself.
 */
export function subscribeToAuthChanges(onChange: (user: User | null) => void): () => void {
  return onIdTokenChanged(getFirebaseAuth(), async (user) => {
    if (user) {
      const token = await user.getIdToken();
      await setToken(token);
    } else {
      await setToken(null);
    }
    onChange(user);
  });
}
