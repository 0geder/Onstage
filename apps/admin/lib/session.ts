import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from './session-token';

/** The signed-in operator, or null. */
export async function getOperator(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Every server action calls this first. The route proxy already keeps signed-out
 * visitors off the pages, but server actions are plain POST endpoints that can
 * be called directly, so each one re-checks the session itself.
 */
export async function requireOperator(): Promise<SessionPayload> {
  const operator = await getOperator();
  if (!operator) throw new Error('Your session has expired. Sign in again.');
  return operator;
}
