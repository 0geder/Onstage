import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Onstage admin',
  description: 'Manual event curation and moderation.',
  // Internal tool. It must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <h1>Onstage admin</h1>
            <nav>
              <Link href="/">Coverage</Link>
              <Link href="/events">Events</Link>
              <Link href="/events/new">Add event</Link>
              <Link href="/venues">Venues</Link>
              <Link href="/moderation">Moderation</Link>
              <Link href="/ingestion">Ingestion</Link>
            </nav>
          </aside>

          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
