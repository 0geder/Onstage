import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Onstage collects, uses, shares and deletes your personal information.',
};

/**
 * Privacy policy.
 *
 * The wording below describes what the system actually does today, and is the
 * text the App Store and Google Play privacy declarations (docs/store/) are
 * checked against — change one, change the other. It is not legal advice and
 * must be reviewed by a South African attorney before Onstage accepts real
 * users — POPIA has specific requirements this page only gestures at.
 *
 * Bracketed values are placeholders the owner must fill before publishing.
 */
export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy</h1>

      <div className="warning">
        This page describes how the product behaves today. It has not been reviewed by a lawyer, and
        must be before Onstage accepts real users.
      </div>

      <p className="faint">Last updated: [DATE OF PUBLICATION]</p>

      <h2>Who we are</h2>
      <p className="muted">
        Onstage is operated by [COMPANY REGISTERED NAME] ([REGISTRATION NUMBER]), [REGISTERED
        ADDRESS], South Africa. We are the responsible party for the personal information described
        here.
      </p>

      <h2>What we collect</h2>
      <p className="muted">
        You can browse gigs and artists without an account. If you create one, we collect:
      </p>
      <ul className="muted">
        <li>
          <strong>Account details</strong> — your email address, display name and handle, and, if you
          sign in with Google or Apple, the name and profile picture link that provider gives us.
          Passwords are handled by Firebase Authentication and never reach our servers.
        </li>
        <li>
          <strong>What you do in the app</strong> — the artists and people you follow, the shows you
          mark as interested or going, your ratings and reviews, your comments, likes and the reports
          you file, invite codes you use, badges you earn, and when you tap through to a ticket
          seller.
        </li>
        <li>
          <strong>Artist claims</strong> — if you claim an artist profile, the explanation and link
          you give us so we can check it.
        </li>
        <li>
          <strong>Settings and consents</strong> — your language, notification preferences, and a
          dated record of each consent you give or withdraw.
        </li>
        <li>
          <strong>Push notification token</strong> — if you allow notifications, an identifier for
          your device that lets us send them.
        </li>
        <li>
          <strong>Location</strong> — only if you allow it, and only while the app is open, never in
          the background. Your phone sends its position with each request for nearby gigs; we use it
          to answer that request and do not store it against your account. The last position is
          kept on your phone so the feed opens quickly. If you decline, you can pick a city instead.
        </li>
        <li>
          <strong>Crash reports</strong> — when the app or our servers hit an error, a report with
          the error, device model and operating system, app version and the screens visited
          beforehand. Reports are not tied to your name, email or account.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <p className="muted">
        To run your account, show gigs near you and from artists you follow, send the notifications
        you have switched on, show your comments and ratings to other people, keep the conversation
        free of scams and abuse, record ticket hand-offs so ticket sellers can pay us referral
        commission, and fix bugs. We do not use your information for advertising, and we do not
        build advertising profiles.
      </p>

      <h2>What other people can see</h2>
      <p className="muted">
        Your display name and profile picture appear next to your comments. People you follow who
        also follow you back can see which shows you are going to; everyone else only sees a count.
      </p>

      <h2>Who we share it with</h2>
      <p className="muted">
        We do not sell your personal information. We use these service providers, who process it
        on our behalf:
      </p>
      <ul className="muted">
        <li>
          <strong>Google Firebase Authentication</strong> — sign-in, including Google and Apple
          sign-in. Holds your email address, name and sign-in method.
        </li>
        <li>
          <strong>Expo push service</strong>, which passes notifications to Apple Push Notification
          service and Google Firebase Cloud Messaging — delivers notifications to your device.
        </li>
        <li>
          <strong>Sentry</strong> — crash and error reports, as described above.
        </li>
        <li>
          <strong>OpenFreeMap</strong> — draws the venue map on an event page. Your phone fetches
          map tiles directly from it, which reveals your IP address and the area being viewed.
        </li>
        <li>
          <strong>[HOSTING PROVIDER]</strong> — hosts our servers and database in [HOSTING REGION].
        </li>
      </ul>
      <p className="muted">
        Some of these providers store data outside South Africa, including in the United States. We
        only use providers bound by data-protection terms that give your information protection
        comparable to POPIA.
      </p>
      <p className="muted">
        When you tap a ticket, ride or map link, you leave Onstage for that provider&rsquo;s own app
        or site (for example Quicket, Howler, Uber, Bolt, inDrive, Google Maps or Apple Maps). We
        pass only the venue&rsquo;s address or the ticket page, plus a referral tag that does not
        identify you. What happens there is governed by that provider&rsquo;s privacy policy.
      </p>

      <h2>What we do not do</h2>
      <p className="muted">
        We do not track the location of artists. We do not process ticket payments or book rides;
        purchases happen on the provider&rsquo;s own site. We do not use advertising identifiers or
        track you across other companies&rsquo; apps and websites.
      </p>

      <h2>How long we keep it</h2>
      <p className="muted">
        We keep your account information until you delete your account. Push tokens are removed when
        you sign out, turn notifications off, or uninstall the app. Crash reports are kept by Sentry
        for up to [SENTRY RETENTION, e.g. 90] days.
      </p>

      <h2>Your rights under POPIA</h2>
      <p className="muted">
        You can withdraw any consent at any time from the app&rsquo;s privacy settings. Withdrawing
        location consent also deletes the location stored on your phone and any home location on our
        servers; withdrawing notification consent deletes your push tokens. You can download
        everything we hold about you from the same screen. To correct anything we hold, contact us
        at the address below. You may also lodge a complaint with the Information Regulator
        (inforegulator.org.za).
      </p>

      <h2>Deleting your account</h2>
      <p className="muted">
        In the app, go to Profile, then Privacy, then Delete my account. Notifications stop
        immediately. Your account, your Firebase sign-in and your personal information are deleted
        after a short grace period during which you can change your mind, and always within 30
        days. Comments that other people have replied to are kept with your name removed and the
        text replaced with &ldquo;[deleted]&rdquo;, so their replies still make sense, and records
        of ticket hand-offs are kept without anything identifying you. See{' '}
        <Link href="/delete-account">how to delete your account</Link>, including if you can no
        longer sign in.
      </p>

      <h2>Children</h2>
      <p className="muted">
        Onstage is not directed at children under [MINIMUM AGE], and we do not knowingly collect
        their personal information. If you believe a child has created an account, contact us and
        we will delete it.
      </p>

      <h2>Contact</h2>
      <p className="muted">
        Information officer: [INFORMATION OFFICER NAME], privacy@onstage.co.za
      </p>
    </article>
  );
}
