/**
 * Growth, retention and business-layer vocabulary (spec section 10).
 *
 * None of this touches payment. Affiliate tags attribute a click that happens
 * on the provider's own site; consent records are a compliance obligation, not
 * a tracking product.
 */

export const COMMENT_THREADS = ['planning', 'recap'] as const;
/** `planning` runs from announcement; `recap` unlocks once the show has started. */
export type CommentThread = (typeof COMMENT_THREADS)[number];

export const CONSENT_TYPES = [
  'location',
  'push_notifications',
  'marketing_email',
  'analytics',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_LABELS: Record<ConsentType, string> = {
  location: 'Use my location to show events near me',
  push_notifications: 'Send me push notifications',
  marketing_email: 'Email me about shows and features',
  analytics: 'Help improve Onstage with usage analytics',
};

export const NOTIFICATION_CATEGORIES = [
  'new_event_announced',
  'on_sale_reminder',
  'price_drop',
  'tickets_back',
  'weekend_digest',
  'post_show_rating',
  'thread_replies',
  // Account notice, not a preference: the answer to a claim the user made.
  'artist_claim_reviewed',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationPrefs {
  newEventAnnounced: boolean;
  onSaleReminder: boolean;
  /** Hours before an on-sale moment to send the reminder. */
  onSaleLeadTimeHours: number;
  priceDrop: boolean;
  /** A sold-out tier for a show you saved is back on sale. */
  ticketsBack: boolean;
  weekendDigest: boolean;
  postShowRating: boolean;
  threadReplies: boolean;
  email: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  newEventAnnounced: true,
  onSaleReminder: true,
  onSaleLeadTimeHours: 24,
  priceDrop: true,
  ticketsBack: true,
  weekendDigest: true,
  postShowRating: true,
  threadReplies: true,
  email: false,
};

/**
 * Attendance streak badges. A streak is consecutive calendar months with at
 * least one attended show — months, not weeks, because a gig calendar has
 * quiet stretches and a weekly streak would punish normal behaviour.
 */
export const BADGES = [
  { code: 'first_show', label: 'First show', thresholdMonths: 1 },
  { code: 'regular', label: 'Regular', thresholdMonths: 3 },
  { code: 'season_ticket', label: 'Season ticket', thresholdMonths: 6 },
  { code: 'year_round', label: 'Year round', thresholdMonths: 12 },
] as const;
export type BadgeCode = (typeof BADGES)[number]['code'];

export function badgesForStreak(streakMonths: number): BadgeCode[] {
  return BADGES.filter((badge) => streakMonths >= badge.thresholdMonths).map(
    (badge) => badge.code,
  );
}

export const SUPPORTED_LOCALES = ['en', 'zu', 'af'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zu: 'isiZulu',
  af: 'Afrikaans',
};

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
