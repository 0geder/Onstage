import { sign } from 'node:crypto';
import type { AppleConfig } from '../../config/configuration';

/**
 * Sign in with Apple REST API — the server half of the token lifecycle.
 *
 * The app's sign-in hands us a one-time authorization code (valid for five
 * minutes). Exchanging it at /auth/token yields a refresh token, which is what
 * App Store guideline 5.1.1(v) needs us to revoke at /auth/revoke when the
 * account is deleted. Revocation lives in the worker's deletion job; this side
 * only exchanges and stores.
 *
 * https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
 * https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
 */

export const APPLE_AUDIENCE = 'https://appleid.apple.com';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';
/** Each secret is minted for one request; Apple allows up to six months. */
const CLIENT_SECRET_TTL_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 10_000;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * The client_secret Apple expects: a JWT signed ES256 with the .p8 key.
 * Node's ECDSA signature is DER by default; JWS wants raw r||s (ieee-p1363).
 */
export function appleClientSecret(
  config: Pick<AppleConfig, 'teamId' | 'keyId' | 'privateKey' | 'clientId'>,
  now: Date = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = { alg: 'ES256', kid: config.keyId, typ: 'JWT' };
  const payload = {
    iss: config.teamId,
    iat,
    exp: iat + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUDIENCE,
    sub: config.clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: config.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

export class AppleTokenError extends Error {
  constructor(
    message: string,
    /** Apple's OAuth error code, e.g. invalid_grant for an expired or reused code. */
    readonly code: string | null,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Exchanges a sign-in authorization code for the user's Apple refresh token. */
export async function exchangeAppleAuthorizationCode(
  config: AppleConfig,
  authorizationCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: appleClientSecret(config),
      code: authorizationCode,
      grant_type: 'authorization_code',
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as
    | { refresh_token?: string; error?: string }
    | null;

  if (!response.ok) {
    const code = body?.error ?? null;
    throw new AppleTokenError(
      `Apple token exchange failed (${response.status}${code ? ` ${code}` : ''})`,
      code,
      response.status,
    );
  }
  if (!body?.refresh_token) {
    throw new AppleTokenError('Apple token exchange returned no refresh token', null, response.status);
  }
  return body.refresh_token;
}
