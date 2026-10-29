'use client';

import Link from 'next/link';

/** Shown when a page throws while rendering, instead of Next's bare error screen. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <article>
      <h1>Something went wrong.</h1>
      <p className="muted">This page could not be loaded right now. Try again in a moment.</p>
      <p className="row">
        <button className="cta" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="cta cta-secondary" href="/">
          Back to Onstage
        </Link>
      </p>
    </article>
  );
}
