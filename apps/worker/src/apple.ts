import { sign } from 'node:crypto';

/**
 * Sign in with Apple token revocation (App Store guideline 5.1.1(v)).
 *
 * The API exchanged each Apple user's sign-in authorization code for a refresh
 * token (apple_credentials). On account deletion the worker revokes it here,
 * which ends the app's authorization in the user's Apple ID settings.
 *
 * https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
 *
 * The client-secret builder mirrors apps/api/src/modules/users/apple-sign-in.ts;
 * the two apps share no Node-only code, so keep them in step.
 */

export interface AppleCredentials {
  teamId: string;
  keyId: string;
  /** PEM of the .p8 key. */
  privateKey: string;
  /** The app's bundle id. */
  clientId: string;
}

export const APPLE_AUDIENCE = 'https://appleid.apple.com';
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const CLIENT_SECRET_TTL_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 10_000;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** ES256 JWT client secret; JWS wants the raw r||s signature, not DER. */
export function appleClientSecret(credentials: AppleCredentials, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = { alg: 'ES256', kid: credentials.keyId, typ: 'JWT' };
  const payload = {
    iss: credentials.teamId,
    iat,
    exp: iat + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUDIENCE,
    sub: credentials.clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: credentials.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Revokes a refresh token. Apple answers 200 with an empty body on success,
 * including for a token that was already revoked or has expired.
 */
export async function revokeAppleRefreshToken(
  credentials: AppleCredentials,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: appleClientSecret(credentials),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      `Apple token revocation failed (${response.status}${body?.error ? ` ${body.error}` : ''})`,
    );
  }
}
