/**
 * Scam heuristics for the resale conversation.
 *
 * Onstage hosts talk about resale and nothing more — it never processes a
 * payment, holds funds, or takes a cut. That keeps us out of marketplace
 * territory, but it also means a scammed user has no chargeback. So the thread
 * carries a permanent warning and every post runs through these patterns.
 *
 * These produce *signals*, not verdicts. A hit raises the post for human review;
 * it never silently deletes anything.
 */

export interface ScamSignal {
  code: string;
  weight: number;
  detail: string;
}

/** Score at or above which a comment is auto-hidden pending human review. */
export const AUTO_HIDE_THRESHOLD = 70;
/** Score at or above which a comment is queued for review but stays visible. */
export const REVIEW_THRESHOLD = 40;

const CRYPTO_WALLET = /\b(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,62})\b/;
const PAYMENT_HANDLE =
  /\b(cash ?app|venmo|zelle|paypal\.me|revolut|payfast\.link|snapscan|zapper|ozow)\b/i;
const OFFSITE_CONTACT = /\b(whats ?app|telegram|signal|dm me|inbox me)\b/i;
const PHONE_NUMBER = /(?:\+27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/;
const UPFRONT_PAYMENT = /\b(pay|eft|deposit|transfer)\b[^.!?]{0,40}\b(first|upfront|before|now)\b/i;
const URGENCY = /\b(last one|urgent|quick sale|first come|going fast|selling now)\b/i;

export interface ScamScoreInput {
  body: string;
  tag: string;
  accountAgeHours: number;
  /** Comments this user has posted in the last hour. */
  recentCommentCount: number;
  /** How many of this user's recent comments share the same body. */
  duplicateBodyCount: number;
}

export function scoreComment(input: ScamScoreInput): {
  score: number;
  signals: ScamSignal[];
} {
  const signals: ScamSignal[] = [];
  const { body } = input;

  if (CRYPTO_WALLET.test(body)) {
    signals.push({ code: 'crypto_wallet', weight: 60, detail: 'Contains a crypto wallet address' });
  }
  if (PAYMENT_HANDLE.test(body)) {
    signals.push({ code: 'payment_handle', weight: 50, detail: 'Contains an offsite payment handle' });
  }
  if (UPFRONT_PAYMENT.test(body)) {
    signals.push({ code: 'upfront_payment', weight: 40, detail: 'Requests payment before delivery' });
  }
  if (OFFSITE_CONTACT.test(body)) {
    signals.push({ code: 'offsite_contact', weight: 20, detail: 'Pushes the conversation offsite' });
  }
  if (PHONE_NUMBER.test(body)) {
    signals.push({ code: 'phone_number', weight: 15, detail: 'Contains a phone number' });
  }
  if (URGENCY.test(body)) {
    signals.push({ code: 'urgency', weight: 10, detail: 'Uses urgency language' });
  }

  // A brand-new account whose only activity is selling is the classic pattern.
  if (input.accountAgeHours < 24 && input.tag === 'have_tickets') {
    signals.push({ code: 'new_account_selling', weight: 35, detail: 'Account under 24 hours old offering tickets' });
  }
  if (input.duplicateBodyCount >= 2) {
    signals.push({ code: 'duplicate_posts', weight: 30, detail: 'Repeated identical posts' });
  }
  if (input.recentCommentCount > 15) {
    signals.push({ code: 'burst_posting', weight: 20, detail: 'Unusually high posting rate' });
  }

  const score = Math.min(
    100,
    signals.reduce((total, signal) => total + signal.weight, 0),
  );
  return { score, signals };
}

/** Wording is deliberately blunt — it is the only protection a user has here. */
export const RESALE_WARNING_COPY =
  'Onstage is not a party to any ticket sale. Deals in this thread happen entirely at your own risk. ' +
  'Never pay before you have verified the seller and the ticket. Report anything that looks off.';
