import type {
  Artist as ArtistRow,
  Comment as CommentRow,
  Event as EventRow,
  EventLineup as EventLineupRow,
  TicketOption as TicketOptionRow,
  User as UserRow,
  Venue as VenueRow,
} from '@prisma/client';
import type {
  Artist,
  ArtistSummary,
  CommentAuthor,
  EventDetail,
  EventSummary,
  LineupEntry,
  PriceRange,
  SocialLinks,
  StreamingLinks,
  ThreadComment,
  TicketOption,
  Venue,
} from '@onstage/shared';
import type { ExternalIds } from '@onstage/shared';

function asRecord<T>(value: unknown): T {
  return (value && typeof value === 'object' ? value : {}) as T;
}

/**
 * A promotion that has run past its end date is simply not promoted any more.
 * Expiry is evaluated on read so a lapsed campaign stops being surfaced the
 * moment it ends, without a sweep job having to catch it first.
 */
function isPromotionLive(flag: boolean, until: Date | null): boolean {
  if (!flag) return false;
  return until === null || until > new Date();
}

export function toArtistSummary(row: ArtistRow): ArtistSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    verified: row.verified,
    genres: row.genres,
    homeCity: row.homeCity,
    country: row.country,
    profileImage: row.profileImage,
    followerCount: row.followerCount,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    isPromoted: isPromotionLive(row.isPromoted, row.promotedUntil),
  };
}

export function toArtist(row: ArtistRow): Artist {
  return {
    ...toArtistSummary(row),
    bio: row.bio,
    bannerImage: row.bannerImage,
    streamingLinks: asRecord<StreamingLinks>(row.streamingLinks),
    socialLinks: asRecord<SocialLinks>(row.socialLinks),
    externalIds: asRecord<ExternalIds>(row.externalIds),
    liveRatingAvg: row.liveRatingAvg,
    liveRatingCount: row.liveRatingCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    addressLine: row.addressLine,
    city: row.city,
    country: row.country,
    lat: row.lat,
    lng: row.lng,
    capacity: row.capacity,
    googlePlaceId: row.googlePlaceId,
    image: row.image,
    website: row.website,
    timezone: row.timezone,
    wheelchairAccess: row.wheelchairAccess,
    ageRestriction: row.ageRestriction,
    reentryPolicy: row.reentryPolicy,
    cloakroom: row.cloakroom,
  };
}

export function toTicketOption(row: TicketOptionRow): TicketOption {
  return {
    id: row.id,
    provider: row.provider,
    tierName: row.tierName,
    priceMinor: row.priceMinor,
    currency: row.currency,
    availability: row.availability,
    purchaseUrl: row.purchaseUrl,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
  };
}

/** Cheapest-to-dearest span across every known provider, ignoring unpriced tiers. */
export function toPriceRange(options: TicketOptionRow[]): PriceRange | null {
  const priced = options.filter(
    (option): option is TicketOptionRow & { priceMinor: number } => option.priceMinor !== null,
  );
  if (priced.length === 0) return null;
  const prices = priced.map((option) => option.priceMinor);
  return {
    minMinor: Math.min(...prices),
    maxMinor: Math.max(...prices),
    currency: priced[0].currency,
  };
}

export type EventWithRelations = EventRow & {
  primaryArtist: ArtistRow;
  venue: VenueRow;
};

export function toEventSummary(row: EventWithRelations, distanceKm?: number): EventSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    startsAt: row.startsAt.toISOString(),
    localTimezone: row.localTimezone,
    status: row.status,
    posterImage: row.posterImage,
    isPromoted: isPromotionLive(row.isPromoted, row.promotedUntil),
    primaryArtist: toArtistSummary(row.primaryArtist),
    venue: {
      id: row.venue.id,
      name: row.venue.name,
      city: row.venue.city,
      country: row.venue.country,
      lat: row.venue.lat,
      lng: row.venue.lng,
    },
    ...(distanceKm === undefined ? {} : { distanceKm: Number(distanceKm.toFixed(1)) }),
  };
}

export type EventDetailRow = EventWithRelations & {
  lineup: (EventLineupRow & { artist: ArtistRow })[];
  ticketOptions: TicketOptionRow[];
};

export function toEventDetail(
  row: EventDetailRow,
  viewerAttendance: EventDetail['viewerAttendance'],
): EventDetail {
  const lineup: LineupEntry[] = [...row.lineup]
    .sort((a, b) => a.billingPosition - b.billingPosition)
    .map((entry) => ({
      artist: toArtistSummary(entry.artist),
      billingPosition: entry.billingPosition,
      role: entry.role,
    }));

  return {
    ...toEventSummary(row),
    doorsOpenAt: row.doorsOpenAt?.toISOString() ?? null,
    ageRestriction: row.ageRestriction,
    description: row.description,
    source: row.source,
    sourceUrl: row.sourceUrl,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    venue: toVenue(row.venue),
    lineup,
    ticketOptions: row.ticketOptions.map(toTicketOption),
    priceRange: toPriceRange(row.ticketOptions),
    commentCount: row.commentCount,
    attendance: {
      interested: row.interestedCount,
      going: row.goingCount,
      attended: row.attendedCount,
    },
    viewerAttendance,
  };
}

export function toCommentAuthor(row: UserRow, now = new Date()): CommentAuthor {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    avatar: row.avatar,
    accountAgeDays: Math.floor((now.getTime() - row.createdAt.getTime()) / 86_400_000),
  };
}

export type CommentWithAuthor = CommentRow & { user: UserRow };

export function toThreadComment(
  row: CommentWithAuthor,
  viewerHasLiked: boolean,
  replies?: ThreadComment[],
): ThreadComment {
  return {
    id: row.id,
    eventId: row.eventId,
    parentCommentId: row.parentCommentId,
    // A hidden comment keeps its slot in the thread so reply chains stay intact,
    // but its text never leaves the server.
    body: row.isHidden ? '[Removed by moderators]' : row.body,
    tag: row.tag,
    likeCount: row.likeCount,
    replyCount: row.replyCount,
    isHidden: row.isHidden,
    createdAt: row.createdAt.toISOString(),
    author: toCommentAuthor(row.user),
    viewerHasLiked,
    ...(replies ? { replies } : {}),
  };
}
