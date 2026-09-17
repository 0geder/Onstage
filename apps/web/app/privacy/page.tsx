import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Onstage collects, uses and deletes your personal information.',
};

/**
 * Privacy policy.
 *
 * The wording below describes what the system actually does today. It is not
 * legal advice and must be reviewed by a South African attorney before Onstage
 * accepts real users — POPIA has specific requirements this page only gestures at.
 */
export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy</h1>

      <div className="warning">
        This page describes how the product behaves today. It has not been reviewed by a lawyer, and
        must be before Onstage accepts real users.
      </div>

      <h2>What we collect</h2>
      <p className="muted">
        Your account details, the artists you follow, the shows you save, your ratings and your
        comments. If you grant permission, we use your location to show gigs near you — while the
        app is open, and never in the background.
      </p>

      <h2>What we do not do</h2>
      <p className="muted">
        We do not track the location of artists. We do not process ticket payments; purchases happen
        on the ticket provider&rsquo;s own site. We do not sell your personal information.
      </p>

      <h2>Your rights under POPIA</h2>
      <p className="muted">
        You can withdraw any consent at any time from the app&rsquo;s privacy settings. Withdrawing
        location consent also deletes the location we have stored. You can download everything we
        hold about you, and you can ask us to delete your account — notifications stop immediately
        and removal completes within 30 days.
      </p>

      <h2>Contact</h2>
      <p className="muted">Information officer: privacy@onstage.co.za</p>
    </article>
  );
}
