/** Lifecycle of an event, drives the availability badge and the primary CTA. */
export const EVENT_STATUSES = [
  'announced',
  'on_sale',
  'low_stock',
  'sold_out',
  'postponed',
  'cancelled',
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Where a record came from. `manual` and `artist_submitted` are never overwritten by ingestion. */
export const EVENT_SOURCES = [
  'bandsintown',
  'songkick',
  'ticketmaster',
  'quicket',
  'webtickets',
  'howler',
  'manual',
  'artist_submitted',
] as const;
export type EventSourceName = (typeof EVENT_SOURCES)[number];

export const MANUAL_SOURCES: readonly EventSourceName[] = ['manual', 'artist_submitted'];

/** True when a record was curated by a human and must survive every ingestion run. */
export function isManualSource(source: string): boolean {
  return (MANUAL_SOURCES as readonly string[]).includes(source);
}

export const LINEUP_ROLES = ['headliner', 'support', 'opener', 'dj_set'] as const;
export type LineupRole = (typeof LINEUP_ROLES)[number];

export const TICKET_PROVIDERS = [
  'quicket',
  'webtickets',
  'computicket',
  'ticketmaster',
  'howler',
  'other',
] as const;
export type TicketProvider = (typeof TICKET_PROVIDERS)[number];

/** How each seller writes its own name. */
export const TICKET_PROVIDER_LABELS: Record<TicketProvider, string> = {
  quicket: 'Quicket',
  webtickets: 'Webtickets',
  computicket: 'Computicket',
  ticketmaster: 'Ticketmaster',
  howler: 'Howler',
  other: 'Ticket seller',
};

export const TICKET_AVAILABILITIES = ['available', 'low', 'sold_out'] as const;
export type TicketAvailability = (typeof TICKET_AVAILABILITIES)[number];

export const ATTENDANCE_STATES = ['interested', 'going', 'attended'] as const;
export type AttendanceState = (typeof ATTENDANCE_STATES)[number];

/** Tags on a thread comment. `have_tickets` / `want_tickets` carry the resale conversation. */
export const COMMENT_TAGS = ['none', 'have_tickets', 'want_tickets', 'going', 'question'] as const;
export type CommentTag = (typeof COMMENT_TAGS)[number];

export const COMMENT_SORTS = ['top', 'newest'] as const;
export type CommentSort = (typeof COMMENT_SORTS)[number];

export const REPORT_REASONS = [
  'scam',
  'spam',
  'harassment',
  'off_topic',
  'offsite_payment',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Claim-your-profile review. Only an operator moves a claim out of `pending`. */
export const ARTIST_CLAIM_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ArtistClaimStatus = (typeof ARTIST_CLAIM_STATUSES)[number];

export const STREAMING_PLATFORMS = [
  'spotify',
  'apple_music',
  'youtube',
  'soundcloud',
  'audiomack',
] as const;
export type StreamingPlatform = (typeof STREAMING_PLATFORMS)[number];

export const SOCIAL_PLATFORMS = ['instagram', 'x', 'tiktok', 'facebook'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Where a show is broadcast live, for fans who cannot be in the room. */
export const LIVESTREAM_PLATFORMS = [
  'youtube',
  'facebook',
  'instagram',
  'tiktok',
  'twitch',
] as const;
export type LivestreamPlatform = (typeof LIVESTREAM_PLATFORMS)[number];

export const LIVESTREAM_PLATFORM_LABELS: Record<LivestreamPlatform, string> = {
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitch: 'Twitch',
};

/** Human-readable labels for UI copy. South African English throughout. */
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  announced: 'Announced',
  on_sale: 'On sale',
  low_stock: 'Almost sold out',
  sold_out: 'Sold out',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
};

export const LINEUP_ROLE_LABELS: Record<LineupRole, string> = {
  headliner: 'Headliner',
  support: 'Support',
  opener: 'Opener',
  dj_set: 'DJ set',
};

export const COMMENT_TAG_LABELS: Record<CommentTag, string> = {
  none: 'Comment',
  have_tickets: 'I have tickets',
  want_tickets: 'Looking for tickets',
  going: 'Going',
  question: 'Question',
};
