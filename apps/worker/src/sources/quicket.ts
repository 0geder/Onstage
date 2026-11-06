import type { EventStatus, TicketAvailability } from '@onstage/shared';
import { config } from '../config';
import { logger } from '../logger';
import { findActs, loadArtistIndex, parseSastTime, plainText, type ArtistIndex } from './acts';
import { fetchJson } from './http';
import type {
  EventSourceAdapter,
  FetchWindow,
  NormalisedEvent,
  NormalisedTicketOption,
} from './types';

/**
 * Quicket: South Africa's largest self-serve ticketing platform, and the
 * long tail Ticketmaster does not reach — club nights, jazz rooms, wine-farm
 * gigs, small festivals.
 *
 * Quicket listings name the event, not the act, so the act is found two ways:
 * a known artist's name inside the title ("Prime Circle live at Aviators"), or
 * a title shaped like "<act> at <place>". Listings with neither — theme
 * parties, untitled festivals — are skipped rather than inventing an "artist"
 * from the event's name, which would fill the catalogue with fake profiles.
 */

interface QuicketTicket {
  name?: string;
  soldOut?: boolean;
  provisionallySoldOut?: boolean;
  price?: number;
  donation?: boolean;
}

interface QuicketEvent {
  id: number;
  name?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  startDate?: string;
  endDate?: string;
  venue?: { name?: string; addressLine1?: string; latitude?: number; longitude?: number } | null;
  locality?: { levelOne?: string; levelTwo?: string; levelThree?: string } | null;
  categories?: { id: number; name: string }[] | null;
  tickets?: QuicketTicket[] | null;
}

interface QuicketPage {
  results: QuicketEvent[] | null;
  pages: number;
}

const PAGE_SIZE = 100;
/** A "music" listing running longer than this is a pass or a residency, not a show. */
const MAX_EVENT_SPAN_MS = 7 * 86_400_000;
const COUNTRY_CODES: Record<string, string> = { 'South Africa': 'ZA' };

export class QuicketAdapter implements EventSourceAdapter {
  readonly name = 'quicket' as const;

  isEnabled(): boolean {
    return config.providers.quicket.enabled;
  }

  async *fetchEvents(window: FetchWindow): AsyncGenerator<NormalisedEvent, void, undefined> {
    const { baseUrl, apiKey } = config.providers.quicket;
    if (!apiKey) return;

    const artists = await loadArtistIndex();
    let skipped = 0;

    for (let page = 1; ; page += 1) {
      let payload: QuicketPage;
      try {
        payload = await fetchJson<QuicketPage>(
          this.name,
          `${baseUrl}/events?api_key=${encodeURIComponent(apiKey)}&pageSize=${PAGE_SIZE}&page=${page}`,
        );
      } catch (error) {
        logger.warn({ page, err: (error as Error).message }, 'Quicket page failed; moving on');
        break;
      }

      for (const raw of payload.results ?? []) {
        const event = this.translate(raw, window, artists);
        if (event) yield event;
        else if (isUpcomingMusic(raw, window)) skipped += 1;
      }
      if (page >= payload.pages) break;
    }

    if (skipped > 0) logger.info({ skipped }, 'Quicket music listings without an identifiable act');
  }

  private translate(
    raw: QuicketEvent,
    window: FetchWindow,
    artists: ArtistIndex,
  ): NormalisedEvent | null {
    if (!isUpcomingMusic(raw, window) || !raw.name || !raw.url) return null;

    const lat = Number(raw.venue?.latitude);
    const lng = Number(raw.venue?.longitude);
    const country = COUNTRY_CODES[raw.locality?.levelOne ?? ''];
    if (!raw.venue?.name || !lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng))
      return null;
    if (!country || (window.markets.length > 0 && !window.markets.includes(country))) return null;

    const acts = findActs(raw.name, artists);
    if (acts.length === 0) return null;

    const startsAt = parseQuicketTime(raw.startDate) as Date;
    const tickets = (raw.tickets ?? []).filter((ticket) => !ticket.donation);
    const ticketOptions: NormalisedTicketOption[] = tickets.map((ticket, index) => ({
      provider: 'quicket',
      tierName: ticket.name?.trim().slice(0, 120) || `Ticket ${index + 1}`,
      // Quicket publishes rands; Onstage stores cents.
      priceMinor: typeof ticket.price === 'number' ? Math.round(ticket.price * 100) : undefined,
      currency: 'ZAR',
      availability: availabilityOf(ticket),
      purchaseUrl: raw.url as string,
    }));

    const status: EventStatus =
      ticketOptions.length > 0 &&
      ticketOptions.every((option) => option.availability === 'sold_out')
        ? 'sold_out'
        : 'on_sale';

    return {
      sourceId: String(raw.id),
      source: this.name,
      title: raw.name.trim(),
      startsAt,
      status,
      description: plainText(raw.description),
      posterImage: raw.imageUrl ? raw.imageUrl.replace(/^\/\//, 'https://') : undefined,
      sourceUrl: raw.url,
      venue: {
        name: raw.venue.name.trim(),
        addressLine: raw.venue.addressLine1?.trim() || undefined,
        city: raw.locality?.levelThree?.trim() || raw.locality?.levelTwo?.trim() || 'Unknown',
        country,
        lat,
        lng,
        timezone: 'Africa/Johannesburg',
      },
      primaryArtist: { name: acts[0] },
      lineup: acts.map((name, index) => ({
        artist: { name },
        billingPosition: index,
        role: index === 0 ? ('headliner' as const) : ('support' as const),
      })),
      ticketOptions,
    };
  }
}

function isUpcomingMusic(raw: QuicketEvent, window: FetchWindow): boolean {
  if (!(raw.categories ?? []).some((category) => category.name === 'Music')) return false;
  const start = parseQuicketTime(raw.startDate);
  if (!start || Number.isNaN(start.getTime())) return false;
  if (start < window.from || start > window.to) return false;
  const end = parseQuicketTime(raw.endDate) ?? start;
  return end.getTime() - start.getTime() <= MAX_EVENT_SPAN_MS;
}

/** Quicket sends local wall-clock times with no offset; see parseSastTime. */
export const parseQuicketTime = parseSastTime;

function availabilityOf(ticket: QuicketTicket): TicketAvailability {
  if (ticket.soldOut) return 'sold_out';
  // Held in other people's baskets: may come back, but it is nearly gone.
  if (ticket.provisionallySoldOut) return 'low';
  return 'available';
}

// Kept importable from here for existing callers and tests.
export { findActs };
