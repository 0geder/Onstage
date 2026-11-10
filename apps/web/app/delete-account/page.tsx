import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Delete your account',
  description: 'How to delete your Onstage account and the personal information that goes with it.',
};

/**
 * Account deletion instructions.
 *
 * Google Play requires a web page, reachable without the app, that explains how
 * to delete an account. The in-app path and the timings below mirror
 * apps/mobile/app/settings/privacy.tsx, the API's deletion request and the
 * worker's account-deletion job — keep them in step.
 */
export default function DeleteAccountPage() {
  return (
    <article>
      <h1>Delete your Onstage account</h1>

      <p className="muted">
        This page explains how to delete your account in the Onstage app, published by [COMPANY
        REGISTERED NAME], and what happens to your information when you do.
      </p>

      <h2>In the app</h2>
      <ol className="muted">
        <li>Open Onstage and sign in.</li>
        <li>Go to the Profile tab.</li>
        <li>Under Settings, tap Privacy.</li>
        <li>Tap Delete my account, then Yes, delete my account.</li>
      </ol>
      <p className="muted">
        Before you delete, you can use Download my data on the same screen to keep a copy of
        everything we hold about you.
      </p>

      <h2>If you can&rsquo;t use the app</h2>
      <p className="muted">
        If you no longer have the app, cannot sign in, or your account has been suspended, email{' '}
        <a href="mailto:privacy@onstage.co.za?subject=Delete%20my%20Onstage%20account">
          privacy@onstage.co.za
        </a>{' '}
        from the email address on the account, with the subject &ldquo;Delete my Onstage
        account&rdquo;. We may ask you to confirm the request before we act on it.
      </p>

      <h2>What happens next</h2>
      <p className="muted">
        Notifications stop straight away. After a grace period of [GRACE PERIOD, e.g. 7] days your
        account is deleted, always within 30 days of your request. Until then you can cancel from
        the same Privacy screen.
      </p>

      <h2>What is deleted</h2>
      <p className="muted">
        Your profile (email address, name, handle and profile picture link), your Firebase sign-in,
        the artists and people you follow, your saved and attended shows, ratings and reviews,
        comments, likes, reports, artist claims, invite codes, badges, consent records, notification
        settings and push tokens.
      </p>

      <h2>What is kept</h2>
      <p className="muted">
        Comments that other people replied to are kept so their replies still make sense, but with
        the text replaced by &ldquo;[deleted]&rdquo; and attributed to &ldquo;Deleted user&rdquo;.
        Records that someone tapped through to a ticket seller are kept for referral accounting with
        nothing that identifies you. Crash reports, which never contained your name or email, expire
        on their own after [SENTRY RETENTION, e.g. 90] days.
      </p>

      <p className="muted">
        More detail is in our <Link href="/privacy">privacy policy</Link>.
      </p>
    </article>
  );
}
