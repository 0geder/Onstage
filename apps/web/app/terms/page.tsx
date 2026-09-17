import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms on which Onstage is provided.',
};

/**
 * Terms placeholder.
 *
 * The resale position stated here is the one the product actually enforces, and
 * it is the clause most in need of legal review before launch.
 */
export default function TermsPage() {
  return (
    <article>
      <h1>Terms</h1>

      <div className="warning">
        Placeholder terms describing current product behaviour. Must be reviewed by a South African
        attorney before launch, particularly the resale section.
      </div>

      <h2>Tickets</h2>
      <p className="muted">
        Onstage lists ticket options and links out to the seller. We never take payment, hold funds,
        or act as the merchant of record. Your purchase is a contract between you and the ticket
        provider.
      </p>

      <h2>Resale between users</h2>
      <p className="muted">
        Onstage hosts conversation about tickets. We do not process, escrow, broker or guarantee any
        sale between users, and we are not a party to one. Any arrangement you make in a thread is
        entirely at your own risk. Never pay before you have verified both the seller and the
        ticket. Report anything that looks like a scam — we ban accounts for it.
      </p>

      <h2>Listings</h2>
      <p className="muted">
        We list announced and confirmed appearances drawn from ticketing partners, aggregators and
        our own curation. Details change; always check with the venue or promoter before travelling.
      </p>
    </article>
  );
}
