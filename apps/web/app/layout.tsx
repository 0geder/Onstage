import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { WEB_BASE_URL } from '../lib/api';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(WEB_BASE_URL),
  title: {
    default: 'Onstage — find out where your artists are playing',
    template: '%s · Onstage',
  },
  description:
    'Look up any artist and see where they are playing, who else is on the bill, how to get tickets and how to get there.',
  openGraph: {
    siteName: 'Onstage',
    type: 'website',
    locale: 'en_ZA',
  },
  twitter: { card: 'summary_large_image' },
  // These pages exist to be found. Everything else about the product is in the
  // app; this is the door.
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="wordmark">
              Onstage
            </Link>
            <span className="faint">Live music in South Africa</span>
          </div>
        </header>

        <main className="container">{children}</main>

        <footer className="site-footer">
          <div className="container">
            <p>
              Onstage lists announced and confirmed performances. We do not track artists&rsquo;
              locations, host audio, or sell tickets — ticket purchases happen on the
              provider&rsquo;s own site.
            </p>
            <p>
              <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
