import Link from 'next/link';

export default function NotFound() {
  return (
    <article>
      <h1>We could not find that.</h1>
      <p className="muted">
        The artist or show may have been removed, or the link may be wrong.
      </p>
      <p>
        <Link className="cta" href="/">
          Back to Onstage
        </Link>
      </p>
    </article>
  );
}
