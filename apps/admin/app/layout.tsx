import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getOperator } from '../lib/session';
import { signOut } from './login/actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'Onstage admin',
  description: 'Manual event curation and moderation.',
  // Internal tool. It must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const operator = await getOperator();

  return (
    <html lang="en-ZA">
      <body>
        {operator ? (
          <div className="layout">
            <aside className="sidebar">
              <h1>Onstage admin</h1>
              <nav>
                <Link href="/">Coverage</Link>
                <Link href="/events">Events</Link>
                <Link href="/events/new">Add event</Link>
                <Link href="/venues">Venues</Link>
                <Link href="/moderation">Moderation</Link>
                <Link href="/claims">Artist claims</Link>
                <Link href="/ingestion">Ingestion</Link>
              </nav>
              <div className="operator">
                <span>Signed in as {operator.sub}</span>
                <form action={signOut}>
                  <button type="submit" className="secondary">
                    Sign out
                  </button>
                </form>
              </div>
            </aside>

            <main className="content">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
