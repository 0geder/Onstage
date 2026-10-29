import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/session-token';

/**
 * Keeps every CMS page behind sign-in. Server actions re-check the session on
 * their own (lib/session.ts), so this is the first line, not the only one.
 */
export function proxy(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const login = new URL('/login', request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== '/') login.searchParams.set('next', next);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the sign-in page and Next's own assets.
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
};
