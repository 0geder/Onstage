'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authenticate } from '../../lib/operators';
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../../lib/session-token';

export interface SignInState {
  error: string | null;
}

// Failed attempts per client+email. In memory on purpose: the CMS runs as a
// single small instance, and a lockout that resets on deploy is acceptable.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

function throttled(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else entry.count += 1;
}

/** Only same-site paths, so the login form can't be used as an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const client = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const key = `${client}:${email.toLowerCase()}`;
  if (throttled(key)) return { error: 'Too many attempts. Wait 15 minutes and try again.' };

  const operator = await authenticate(email, password);
  if (!operator) {
    recordFailure(key);
    return { error: 'Incorrect email or password.' };
  }
  failures.delete(key);

  (await cookies()).set(SESSION_COOKIE, createSessionToken(operator.email, operator.userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(safeNext(form.get('next')));
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
