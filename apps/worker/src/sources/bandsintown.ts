import { config } from '../config';
import { logger } from '../logger';
import { fetchJson } from './http';
import type { EventSourceAdapter, FetchWindow, NormalisedEvent } from './types';
import { prisma } from '../prisma';
import { DEFAULT_TIMEZONE, isValidTimezone, parseLocalDateTime } from '../timezone';

/**
 * Bandsintown adapter.
 *
 * Bandsintown is artist-centric: there is no "everything happening in this
 * country" endpoint, only "events for this artist". So this adapter walks the
 * artists Onstage already knows about, which means it deepens existing coverage
 * rather than discovering new acts. Discovery of the local scene comes from the
 * admin CMS, and that division of labour is deliberate.
 *
 * Commercial use has historically required partner approval. Confirm current
 * terms before enabling this in production.
 */

interface BandsintownVenue {
  name?: string;
  latitude?: string;
  longitude?: string;
  city?: string;
  country?: string;
  street_address?: string;
  /** IANA zone. Not documented, but present on some responses; used when it is. */
  timezone?: string;
}

interface BandsintownOffer {
  type?: string;
  url?: string;
  status?: string;
}

interface BandsintownEvent {
  id?: string;
  url?: string;
  datetime?: string;
  description?: string;
  artist?: { name?: string; image_url?: string; mbid?: string };
  lineup?: string[];
  venue?: BandsintownVenue;
  offers?: BandsintownOffer[];
  title?: string;
}

/**
 * Bandsintown's `datetime` is the venue's local wall-clock time with no offset,
 * so the zone has to come from somewhere else. Its `country` is also a full
 * name ("South Africa"), not an ISO code. Single-zone countries in and around
 * the launch markets are listed; anything else falls back to SAST, which is
 * right for every ZA venue and wrong by at most an hour or two in the region.
 */
const COUNTRIES: [code: string, name: string, timezone: string][] = [
  ['ZA', 'south africa', 'Africa/Johannesburg'],
  ['LS', 'lesotho', 'Africa/Maseru'],
  ['SZ', 'eswatini', 'Africa/Mbabane'],
  ['NA', 'namibia', 'Africa/Windhoek'],
  ['BW', 'botswana', 'Africa/Gaborone'],
  ['ZW', 'zimbabwe', 'Africa/Harare'],
  ['ZM', 'zambia', 'Africa/Lusaka'],
  ['MZ', 'mozambique', 'Africa/Maputo'],
  ['MW', 'malawi', 'Africa/Blantyre'],
  ['KE', 'kenya', 'Africa/Nairobi'],
  ['TZ', 'tanzania', 'Africa/Dar_es_Salaam'],
  ['UG', 'uganda', 'Africa/Kampala'],
  ['NG', 'nigeria', 'Africa/Lagos'],
  ['GH', 'ghana', 'Africa/Accra'],
  ['GB', 'united kingdom', 'Europe/London'],
];

function countryCode(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value.length === 2) return value.toUpperCase();
  const match = COUNTRIES.find(([, name]) => name === value.toLowerCase());
  return match ? match[0] : value.slice(0, 2).toUpperCase();
}

function venueTimezone(venue: BandsintownVenue, country: string): string {
  if (isValidTimezone(venue.timezone)) return venue.timezone;
  return COUNTRIES.find(([code]) => code === country)?.[2] ?? DEFAULT_TIMEZONE;
}

/** How many known artists to poll per run, newest-followed first. */
const ARTISTS_PER_RUN = { hot: 60, cold: 400 } as const;

export class BandsintownAdapter implements EventSourceAdapter {
  readonly name = 'bandsintown' as const;

  isEnabled(): boolean {
    return config.providers.bandsintown.enabled;
  }

  async *fetchEvents(window: FetchWindow): AsyncGenerator<NormalisedEvent, void, undefined> {
    const { baseUrl, appId } = config.providers.bandsintown;
    if (!appId) return;

    // Most-followed artists first: if a run is cut short, it is cut short on the
    // artists fewest people care about.
    const artists = await prisma.artist.findMany({
      select: { name: true, externalIds: true },
      orderBy: { followerCount: 'desc' },
      take: ARTISTS_PER_RUN[window.tier],
    });

    for (const artist of artists) {
      const external = (artist.externalIds ?? {}) as Record<string, string>;
      const identifier = external.bandsintown_id ?? artist.name;
      const url =
        `${baseUrl}/artists/${encodeURIComponent(identifier)}/events` +
        `?app_id=${encodeURIComponent(appId)}` +
        `&date=${window.from.toISOString().slice(0, 10)}%2C${window.to.toISOString().slice(0, 10)}`;

      let payload: BandsintownEvent[];
      try {
        payload = await fetchJson<BandsintownEvent[]>(this.name, url);
      } catch (error) {
        // One artist failing is not a reason to abandon the rest of the run.
        logger.warn({ artist: artist.name, err: (error as Error).message }, 'Bandsintown lookup failed');
        continue;
      }

      if (!Array.isArray(payload)) continue;

      for (const raw of payload) {
        const event = this.translate(raw, window);
        if (event) yield event;
      }
    }
  }

  private translate(raw: BandsintownEvent, window: FetchWindow): NormalisedEvent | null {
    const lat = Number(raw.venue?.latitude);
    const lng = Number(raw.venue?.longitude);

    // Without coordinates the event cannot answer "is this near me", cannot be
    // deduplicated by venue proximity, and cannot offer directions. Drop it.
    if (!raw.id || !raw.datetime || !raw.venue?.name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const country = countryCode(raw.venue.country);
    if (window.markets.length > 0 && !window.markets.includes(country)) return null;

    const timezone = venueTimezone(raw.venue, country);
    const startsAt = parseLocalDateTime(raw.datetime, timezone);
    if (!startsAt) return null;

    const artistName = raw.artist?.name?.trim();
    if (!artistName) return null;

    const ticketOffer = raw.offers?.find((offer) => offer.type?.toLowerCase() === 'tickets');
    const soldOut = ticketOffer?.status?.toLowerCase() === 'sold out';

    const support = (raw.lineup ?? [])
      .filter((name) => name && name !== artistName)
      .map((name, index) => ({
        artist: { name: name.trim() },
        billingPosition: index + 1,
        role: (index === 0 ? 'support' : 'opener') as 'support' | 'opener',
      }));

    return {
      sourceId: String(raw.id),
      source: this.name,
      title: raw.title?.trim() || `${artistName} at ${raw.venue.name}`,
      startsAt,
      status: soldOut ? 'sold_out' : ticketOffer ? 'on_sale' : 'announced',
      description: raw.description?.trim() || undefined,
      sourceUrl: raw.url,
      venue: {
        name: raw.venue.name,
        addressLine: raw.venue.street_address,
        city: raw.venue.city ?? 'Unknown',
        country: country || 'ZA',
        lat,
        lng,
        timezone,
      },
      primaryArtist: {
        name: artistName,
        externalId: raw.artist?.mbid,
        externalIdKey: raw.artist?.mbid ? 'bandsintown_id' : undefined,
        imageUrl: raw.artist?.image_url,
      },
      lineup: [
        {
          artist: { name: artistName, imageUrl: raw.artist?.image_url },
          billingPosition: 0,
          role: 'headliner',
        },
        ...support,
      ],
      ticketOptions: ticketOffer?.url
        ? [
            {
              provider: 'other',
              tierName: 'General',
              currency: 'ZAR',
              availability: soldOut ? 'sold_out' : 'available',
              purchaseUrl: ticketOffer.url,
            },
          ]
        : [],
    };
  }
}
