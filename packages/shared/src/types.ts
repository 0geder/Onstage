import type {
  ArtistClaimStatus,
  AttendanceState,
  CommentTag,
  EventSourceName,
  EventStatus,
  LineupRole,
  LivestreamPlatform,
  SocialPlatform,
  StreamingPlatform,
  TicketAvailability,
  TicketProvider,
} from './enums';

export type StreamingLinks = Partial<Record<StreamingPlatform, string>>;
export type SocialLinks = Partial<Record<SocialPlatform, string>>;
export type LivestreamLinks = Partial<Record<LivestreamPlatform, string>>;

export interface ExternalIds {
  bandsintown_id?: string;
  songkick_id?: string;
  spotify_id?: string;
  musicbrainz_id?: string;
  ticketmaster_id?: string;
}

export interface ArtistSummary {
  id: string;
  name: string;
  slug: string;
  verified: boolean;
  genres: string[];
  homeCity: string | null;
  country: string | null;
  profileImage: string | null;
  followerCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  /** Paid placement. Clients must render this with a visible "Promoted" label. */
  isPromoted: boolean;
}

export interface Artist extends ArtistSummary {
  bio: string | null;
  bannerImage: string | null;
  streamingLinks: StreamingLinks;
  socialLinks: SocialLinks;
  externalIds: ExternalIds;
  liveRatingAvg: number | null;
  liveRatingCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Per-viewer fields on the artist profile response. Signed out, all are false or null. */
export interface ArtistViewerState {
  viewerIsFollowing: boolean;
  /** An approved claim on this profile, or platform staff: may edit it. */
  viewerManages: boolean;
  /** The viewer's own claim on this profile, if they have made one. */
  viewerClaimStatus: ArtistClaimStatus | null;
}

/** A claim as its claimant sees it. The evidence is visible only to them and to operators. */
export interface ArtistClaim {
  id: string;
  status: ArtistClaimStatus;
  evidence: string;
  contactUrl: string | null;
  createdAt: string;
  reviewedAt: string | null;
  artist: ArtistSummary;
}

export interface Venue {
  id: string;
  name: string;
  addressLine: string | null;
  city: string;
  country: string;
  lat: number;
  lng: number;
  capacity: number | null;
  googlePlaceId: string | null;
  image: string | null;
  website: string | null;
  timezone: string;
  // Accessibility and logistics. `null` means unknown, which clients must
  // render as "not stated" rather than as "no".
  wheelchairAccess: boolean | null;
  ageRestriction: string | null;
  reentryPolicy: string | null;
  cloakroom: boolean | null;
}

export interface LineupEntry {
  artist: ArtistSummary;
  billingPosition: number;
  role: LineupRole;
}

export interface TicketOption {
  id: string;
  provider: TicketProvider;
  tierName: string;
  priceMinor: number | null;
  currency: string;
  availability: TicketAvailability;
  purchaseUrl: string;
  lastCheckedAt: string | null;
}

export interface EventSummary {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  localTimezone: string;
  status: EventStatus;
  posterImage: string | null;
  isPromoted: boolean;
  primaryArtist: ArtistSummary;
  venue: Pick<Venue, 'id' | 'name' | 'city' | 'country' | 'lat' | 'lng'>;
  /** Social proof on feed cards: how many people have saved or committed. */
  interestedCount: number;
  goingCount: number;
  /** Present on geo queries only. */
  distanceKm?: number;
}

export interface EventDetail extends EventSummary {
  doorsOpenAt: string | null;
  ageRestriction: string | null;
  description: string | null;
  source: EventSourceName;
  sourceUrl: string | null;
  lastSyncedAt: string | null;
  venue: Venue;
  lineup: LineupEntry[];
  ticketOptions: TicketOption[];
  priceRange: PriceRange | null;
  /** Where the show is broadcast live. Empty for most gigs. */
  livestreamLinks: LivestreamLinks;
  commentCount: number;
  attendance: AttendanceCounts;
  /** The signed-in user's own state, null when unauthenticated. */
  viewerAttendance: AttendanceState | null;
  /** True when the viewer may edit this event's livestream links. */
  viewerManages: boolean;
}

export interface PriceRange {
  minMinor: number;
  maxMinor: number;
  currency: string;
}

export interface AttendanceCounts {
  interested: number;
  going: number;
  attended: number;
}

export interface ThreadComment {
  id: string;
  eventId: string;
  parentCommentId: string | null;
  body: string;
  tag: CommentTag;
  likeCount: number;
  replyCount: number;
  isHidden: boolean;
  createdAt: string;
  author: CommentAuthor;
  viewerHasLiked: boolean;
  replies?: ThreadComment[];
}

export interface CommentAuthor {
  id: string;
  handle: string;
  displayName: string;
  avatar: string | null;
  /** Rendered as a "new account" hint next to scam-prone tags. */
  accountAgeDays: number;
}

/** Someone the viewer has blocked; their comments are hidden from the viewer. */
export interface BlockedUser {
  id: string;
  handle: string;
  displayName: string;
  avatar: string | null;
  blockedAt: string;
}

export interface Rating {
  id: string;
  artistId: string;
  eventId: string | null;
  score: number;
  reviewText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ArtistSearchResult {
  artist: ArtistSummary;
  /** The next announced show, so a search result is immediately actionable. */
  nextEvent: EventSummary | null;
  /** Relevance score, exposed mainly for tuning and debugging. */
  score: number;
}

export interface DiscoveryFeed {
  nearYou: EventSummary[];
  fromArtistsYouFollow: EventSummary[];
  thisWeekend: EventSummary[];
  /** Null when the client sent no location and the user has no saved home. */
  centre: GeoPoint | null;
  radiusKm: number;
}
