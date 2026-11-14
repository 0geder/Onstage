import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with the Onstage app: gig listings, your account, comments and privacy.',
};

/**
 * Support page — the "Support URL" both app stores ask for. The answers mirror
 * what the app actually does; keep them in step with the mobile screens.
 */
export default function SupportPage() {
  return (
    <article>
      <h1>Onstage support</h1>

      <p className="muted">
        Questions, problems or feedback about the Onstage app? Email{' '}
        <a href="mailto:[SUPPORT EMAIL]?subject=Onstage%20support">[SUPPORT EMAIL]</a> and tell us
        what phone you use and what happened. We aim to reply within two working days.
      </p>

      <h2>A gig is missing or wrong</h2>
      <p className="muted">
        Listings come from ticketing partners and are refreshed through the day. If a date, venue
        or price looks wrong, email us the gig&rsquo;s name and what should change, and we&rsquo;ll
        check it with the source. Tickets are sold by the ticketing partner, so refunds and ticket
        problems go to them.
      </p>

      <h2>I don&rsquo;t see gigs near me</h2>
      <p className="muted">
        Onstage shows gigs within 50&nbsp;km of you. If you didn&rsquo;t allow location, or you want
        another city, tap the &ldquo;Gigs near&rdquo; line at the top of Discover and pick a city.
      </p>

      <h2>Someone is being abusive in the comments</h2>
      <p className="muted">
        Tap Report on the comment, and it goes to our moderators. You can also tap Block to hide
        everything that person writes; they aren&rsquo;t told. Unblock them any time under Profile →
        Settings → Privacy → Blocked people.
      </p>

      <h2>Notifications</h2>
      <p className="muted">
        Choose which alerts you get under Profile → Settings → Notifications. If none arrive, check
        that notifications for Onstage are allowed in your phone&rsquo;s settings.
      </p>

      <h2>Your account and data</h2>
      <p className="muted">
        Download a copy of your data or delete your account under Profile → Settings → Privacy. See{' '}
        <Link href="/delete-account">deleting your account</Link> and our{' '}
        <Link href="/privacy">privacy policy</Link>. Privacy requests can also go to{' '}
        <a href="mailto:privacy@onstage.co.za">privacy@onstage.co.za</a>.
      </p>
    </article>
  );
}
