import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed session tokens for CMS operators.
 *
 * `<base64url payload>.<base64url HMAC-SHA256>` — stateless, so any replica can
 * verify it, and tamper-evident, so the cookie cannot be edited to become
 * someone else. Kept free of Next imports so the route proxy can use it too.
 */

export const SESSION_COOKIE = 'onstage_admin';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionPayload {
  /** Operator email. */
  sub: string;
  /** The operator's isAdmin user id in the API, when mapped — recorded as moderator. */
  uid?: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

function secret(): Buffer {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must be set to at least 32 characters.');
  }
  return Buffer.from(value);
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function createSessionToken(sub: string, uid?: string): string {
  const payload: SessionPayload = {
    sub,
    ...(uid ? { uid } : {}),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

/** The payload if the token is authentic and unexpired, otherwise null. */
export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;

  const expected = Buffer.from(sign(data));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as SessionPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
