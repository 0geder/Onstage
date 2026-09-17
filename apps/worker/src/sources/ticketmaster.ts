import type { EventStatus, TicketAvailability } from '@onstage/shared';
import { config } from '../config';
import { logger } from '../logger';
import { fetchJson } from './http';
import type { EventSourceAdapter, FetchWindow, NormalisedEvent, NormalisedLineupEntry } from './types';

/**
 * Ticketmaster Discovery adapter.
 *
 * Unlike Bandsintown this is market-centric — it answers "what is on sale in
 * this country between these dates" — so it is the source that can discover
 * events for artists Onstage has never heard of. It also carries real price and
 * availability data, which is what the event page's ticket section needs.
 */

interface TmImage {
  url?: string;
  width?: number;
  ratio?: string;
}

interface TmVenue {
  name?: string;
  city?: { name?: string };
  country?: { countryCode?: string };
  address?: { line1?: string };
  location?: { latitude?: string; longitude?: string };
  timezone?: string;
}

interface TmAttraction {
  name?: string;
  id?: string;
  images?: TmImage[];
  classifications?: { genre?: { name?: string }; subGenre?: { name?: string } }[];
}

interface TmPriceRange {
  type?: string;
  currency?: string;
  min?: number;
  max?: number;
}

interface TmEvent {
  id?: string;
  name?: string;
  url?: string;
  info?: string;
  images?: TmImage[];
  dates?: {
    start?: { dateTime?: string; localDate?: string };
    status?: { code?: string };
    timezone?: string;
  };
  sales?: { public?: { startDateTime?: string } };
  priceRanges?: TmPriceRange[];
  ageRestrictions?: { legalAgeEnforced?: boolean };
  _embedded?: { venues?: TmVenue[]; attractions?: TmAttraction[] };
}

interface TmResponse {
  _embedded?: { events?: TmEvent[] };
  page?: { totalPages?: number; number?: number };
}

const PAGE_SIZE = 100;
/** Discovery caps deep paging; stop well before it starts erroring. */
const MAX_PAGES = 20;

export class TicketmasterAdapter implements EventSourceAdapter {
  readonly name = 'ticketmaster' as const;

  isEnabled(): boolean {
    return config.providers.ticketmaster.enabled;
  }

  async *fetchEvents(window: FetchWindow): AsyncGenerator<NormalisedEvent, void, undefined> {
    const { baseUrl, apiKey } = config.providers.ticketmaster;
    if (!apiKey) return;

    for (const market of window.markets) {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const url =
          `${baseUrl}/events.json?apikey=${encodeURIComponent(apiKey)}` +
          `&countryCode=${encodeURIComponent(market)}` +
          `&classificationName=music` +
          `&startDateTime=${window.from.toISOString().replace(/\.\d{3}Z$/, 'Z')}` +
          `&endDateTime=${window.to.toISOString().replace(/\.\d{3}Z$/, 'Z')}` +
          `&size=${PAGE_SIZE}&page=${page}&sort=date,asc`;

        let payload: TmResponse;
        try {
          payload = await fetchJson<TmResponse>(this.name, url);
        } catch (error) {
          logger.warn(
            { market, page, err: (error as Error).message },
            'Ticketmaster page failed; moving on',
          );
          break;
        }

        const events = payload._embedded?.events ?? [];
        for (const raw of events) {
          const event = this.translate(raw, market);
          if (event) yield event;
        }

        const totalPages = payload.page?.totalPages ?? 0;
        if (events.length < PAGE_SIZE || page + 1 >= totalPages) break;
      }
    }
  }

  private translate(raw: TmEvent, market: string): NormalisedEvent | null {
    const venue = raw._embedded?.venues?.[0];
    const lat = Number(venue?.location?.latitude);
    const lng = Number(venue?.location?.longitude);
    const startIso = raw.dates?.start?.dateTime;

    if (!raw.id || !raw.name || !venue?.name || !startIso || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const startsAt = new Date(startIso);
    if (Number.isNaN(startsAt.getTime())) return null;

    const attractions = raw._embedded?.attractions ?? [];
    const headliner = attractions[0];
    const primaryName = headliner?.name?.trim() ?? raw.name.trim();

    const lineup: NormalisedLineupEntry[] = attractions.length
      ? attractions.map((attraction, index) => ({
          artist: {
            name: attraction.name?.trim() ?? primaryName,
            externalId: attraction.id,
            externalIdKey: 'ticketmaster_id' as const,
            imageUrl: bestImage(attraction.images),
            genres: genresOf(attraction),
          },
          billingPosition: index,
          role: (index === 0 ? 'headliner' : index === 1 ? 'support' : 'opener') as
            | 'headliner'
            | 'support'
            | 'opener',
        }))
      : [
          {
            artist: { name: primaryName },
            billingPosition: 0,
            role: 'headliner' as const,
          },
        ];

    const status = mapStatus(raw.dates?.status?.code);
    const priceRange = raw.priceRanges?.[0];

    return {
      sourceId: raw.id,
      source: this.name,
      title: raw.name.trim(),
      startsAt,
      onSaleAt: raw.sales?.public?.startDateTime
        ? new Date(raw.sales.public.startDateTime)
        : undefined,
      status,
      description: raw.info?.trim() || undefined,
      posterImage: bestImage(raw.images),
      sourceUrl: raw.url,
      ageRestriction: raw.ageRestrictions?.legalAgeEnforced ? '18+' : undefined,
      venue: {
        name: venue.name,
        addressLine: venue.address?.line1,
        city: venue.city?.name ?? 'Unknown',
        country: venue.country?.countryCode ?? market,
        lat,
        lng,
        timezone: venue.timezone ?? raw.dates?.timezone,
      },
      primaryArtist: {
        name: primaryName,
        externalId: headliner?.id,
        externalIdKey: headliner?.id ? 'ticketmaster_id' : undefined,
        imageUrl: bestImage(headliner?.images),
        genres: genresOf(headliner),
      },
      lineup,
      ticketOptions:
        raw.url && priceRange
          ? [
              {
                provider: 'ticketmaster',
                tierName: priceRange.type?.trim() || 'Standard',
                // Providers publish major units; Onstage stores cents.
                priceMinor:
                  typeof priceRange.min === 'number'
                    ? Math.round(priceRange.min * 100)
                    : undefined,
                currency: priceRange.currency ?? 'ZAR',
                availability: availabilityFor(status),
                purchaseUrl: raw.url,
              },
            ]
          : raw.url
            ? [
                {
                  provider: 'ticketmaster' as const,
                  tierName: 'Standard',
                  currency: 'ZAR',
                  availability: availabilityFor(status),
                  purchaseUrl: raw.url,
                },
              ]
            : [],
    };
  }
}

function mapStatus(code?: string): EventStatus {
  switch (code) {
    case 'onsale':
      return 'on_sale';
    case 'offsale':
      return 'sold_out';
    case 'cancelled':
      return 'cancelled';
    case 'postponed':
    case 'rescheduled':
      return 'postponed';
    default:
      return 'announced';
  }
}

function availabilityFor(status: EventStatus): TicketAvailability {
  if (status === 'sold_out') return 'sold_out';
  if (status === 'low_stock') return 'low';
  return 'available';
}

/** Widest 16:9 image available — these are used as posters and banners. */
function bestImage(images?: TmImage[]): string | undefined {
  if (!images?.length) return undefined;
  const wide = images
    .filter((image) => image.url && (image.ratio === '16_9' || !image.ratio))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return (wide[0] ?? images[0]).url;
}

function genresOf(attraction?: TmAttraction): string[] | undefined {
  if (!attraction?.classifications?.length) return undefined;
  const genres = attraction.classifications
    .flatMap((classification) => [classification.genre?.name, classification.subGenre?.name])
    .filter((name): name is string => Boolean(name) && name !== 'Undefined')
    .map((name) => name.toLowerCase());
  return genres.length ? [...new Set(genres)] : undefined;
}
