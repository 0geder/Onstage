import 'server-only';
import { scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * CMS operator accounts.
 *
 * Configured in ADMIN_USERS as a JSON array, one entry per person:
 *   [{ "email": "curator@onstage.co.za", "passwordHash": "scrypt$...", "userId": "<uuid>" }]
 * Hashes come from `npm run hash-password -w @onstage/admin`. `userId` is
 * optional: the operator's isAdmin user in the API, so moderation actions are
 * recorded against a person rather than the shared CMS token.
 */

interface Operator {
  email: string;
  passwordHash: string;
  userId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

function operators(): Operator[] {
  try {
    const parsed = JSON.parse(process.env.ADMIN_USERS ?? '[]') as Operator[];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry?.email === 'string' && typeof entry?.passwordHash === 'string')
      : [];
  } catch {
    return [];
  }
}

/** `scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>` — the format hash-password writes. */
async function matches(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return timingSafeEqual(actual, expected);
}

// A hash of a random password with the production parameters, checked when
// the email is unknown so a miss takes as long as a wrong password.
const DECOY =
  'scrypt$32768$8$1$c2FsdHNhbHRzYWx0c2FsdA==$' + Buffer.alloc(64).toString('base64');

export async function authenticate(
  email: string,
  password: string,
): Promise<{ email: string; userId?: string } | null> {
  const operator = operators().find((entry) => entry.email.toLowerCase() === email.toLowerCase());
  const ok = await matches(password, operator?.passwordHash ?? DECOY).catch(() => false);
  if (!operator || !ok) return null;
  return {
    email: operator.email,
    userId: operator.userId && UUID.test(operator.userId) ? operator.userId : undefined,
  };
}

export function operatorsConfigured(): boolean {
  return operators().length > 0;
}
