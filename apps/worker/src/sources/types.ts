import type {
  EventSourceName,
  EventStatus,
  LineupRole,
  TicketAvailability,
  TicketProvider,
} from '@onstage/shared';

/**
 * The adapter boundary.
 *
 * Every provider — aggregator, ticketing API, or a scraper we are permitted to
 * run — is reduced to this one interface. That is the whole mitigation for the
 * biggest structural risk in this product: any single source can be revoked,
 * repriced or simply go away, and replacing it must not require touching the
 * pipeline, the schema, or the API.
 *
 * An adapter's only job is to fetch and translate. It does not deduplicate, it
 * does not write to the database, and it never decides whether its data wins
 * over another source's.
 */

export interface NormalisedVenue {
  name: string;
  addressLine?: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  lat: number;
  lng: number;
  capacity?: number;
  googlePlaceId?: string;
  timezone?: string;
}

export interface NormalisedArtist {
  name: string;
  /** The provider's own identifier, kept so profiles can be reconciled later. */
  externalId?: string;
  externalIdKey?: 'bandsintown_id' | 'songkick_id' | 'ticketmaster_id' | 'spotify_id';
  imageUrl?: string;
  genres?: string[];
}

export interface NormalisedLineupEntry {
  artist: NormalisedArtist;
  billingPosition: number;
  role: LineupRole;
}

export interface NormalisedTicketOption {
  provider: TicketProvider;
  tierName: string;
  /** Minor units. Omitted when the provider does not publish a price. */
  priceMinor?: number;
  currency: string;
  availability: TicketAvailability;
  purchaseUrl: string;
}

export interface NormalisedEvent {
  /** Stable identifier within this source. Upserts key on (source, sourceId). */
  sourceId: string;
  source: EventSourceName;
  title: string;
  startsAt: Date;
  doorsOpenAt?: Date;
  onSaleAt?: Date;
  status: EventStatus;
  description?: string;
  posterImage?: string;
  sourceUrl?: string;
  ageRestriction?: string;
  venue: NormalisedVenue;
  primaryArtist: NormalisedArtist;
  lineup: NormalisedLineupEntry[];
  ticketOptions: NormalisedTicketOption[];
}

export interface FetchWindow {
  /** `hot` runs hourly over events on sale; `cold` sweeps the long tail daily. */
  tier: 'hot' | 'cold';
  from: Date;
  to: Date;
  /** ISO country codes to cover on this pass. */
  markets: string[];
}

/**
 * What an adapter saw of its source on one pass, filled in as it goes.
 *
 * The pipeline retires events a source has stopped listing, which is only
 * safe when the pass saw everything the source lists for the window. A page
 * that failed and was skipped looks exactly like a quiet catalogue otherwise,
 * so an adapter that moves on past a failure must say so here.
 */
export interface SweepReport {
  /** Why this pass did not see the whole catalogue. Unset means it did. */
  incomplete?: string;
}

export interface EventSourceAdapter {
  readonly name: EventSourceName;
  /**
   * True when one pass lists everything the source has for the window, so an
   * event missing from a complete pass has gone from the source. False for a
   * source only ever sampled (Bandsintown polls a capped list of artists),
   * where absence proves nothing and nothing is ever delisted.
   */
  readonly sweepsWholeCatalogue: boolean;
  /** False when the provider has no credentials configured. */
  isEnabled(): boolean;
  /**
   * Fetches and normalises. Implementations should yield incrementally so a
   * provider that paginates for a long time does not hold everything in memory,
   * and so a failure partway through still leaves earlier pages ingested.
   * Anything skipped on the way (a failed page, a paging cap) is recorded on
   * `sweep`.
   */
  fetchEvents(
    window: FetchWindow,
    sweep?: SweepReport,
  ): AsyncGenerator<NormalisedEvent, void, undefined>;
}
