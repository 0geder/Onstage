import { nearestCity, type EventStatus, type TicketAvailability } from '@onstage/shared';
import { config } from '../config';
import { logger } from '../logger';
import { prisma } from '../prisma';
import { findActs, loadArtistIndex, parseSastTime, plainText, type ArtistIndex } from './acts';
import type {
  EventSourceAdapter,
  FetchWindow,
  NormalisedEvent,
  NormalisedTicketOption,
} from './types';

/**
 * Howler events, from the Event Webhook payloads the API stores in
 * howler_events.
 *
 * Howler has no public listings API and its terms forbid reading the website,
 * so the only events here are ones an organiser chose to send us. The webhook
 * is richer than a listing, though: it carries tickets remaining per tier, so
 * low-stock and tickets-back alerts work for Howler gigs too.
 */

/** At or below this share of a tier left, it is shown as nearly gone. */
const LOW_STOCK_SHARE = 0.1;
/** A week-long "event" is a season pass or a residency, not a show. */
const MAX_EVENT_SPAN_MS = 7 * 86_400_000;
const COUNTRY_CODES: Record<string, string> = { 'south africa': 'ZA', za: 'ZA' };

/** The Event Webhook body, as documented in Howler Webhooks v1. */
export interface HowlerEventPayload {
  event_id: number;
  event_name?: string;
  event_header_image_url?: string | null;
  event_url?: string;
  event_status?: 'pending' | 'active' | 'cancelled';
  event_country?: string;
  event_details?: string | null;
  event_sold_out?: boolean;
  event_venue?: { name?: string; address?: string; latitude?: string; longitude?: string };
  event_start_time?: string | null;
  event_end_time?: string | null;
  event_currency?: string;
  event_ticket_types?: HowlerTicketType[];
}

export interface HowlerTicketType {
  ticket_type_name?: string;
  ticket_type_quantity?: number;
  ticket_type_remaining?: number;
  ticket_type_onsale_start_time?: string | null;
  ticket_type_onsale_end_time?: string | null;
  ticket_type_cost_cents?: number;
  ticket_type_cost_currency?: string;
}

export class HowlerAdapter implements EventSourceAdapter {
  readonly name = 'howler' as const;

  isEnabled(): boolean {
    return config.providers.howler.enabled;
  }

  async *fetchEvents(window: FetchWindow): AsyncGenerator<NormalisedEvent, void, undefined> {
    const rows = await prisma.howlerEvent.findMany({
      where: { startsAt: { gte: window.from, lte: window.to } },
      select: { payload: true },
    });
    if (rows.length === 0) return;

    const artists = await loadArtistIndex();
    let skipped = 0;
    for (const row of rows) {
      const payload = row.payload as unknown as HowlerEventPayload;
      const event = translateHowlerEvent(payload, window, artists);
      if (event) yield event;
      else skipped += 1;
    }
    if (skipped > 0) {
      logger.info({ skipped }, 'Howler events not listed (unpublished, abroad or no act)');
    }
  }
}

/** One webhook payload as an Onstage event, or null when it shouldn't be listed. */
export function translateHowlerEvent(
  raw: HowlerEventPayload,
  window: FetchWindow,
  artists: ArtistIndex,
  now = new Date(),
): NormalisedEvent | null {
  // Pending events aren't published on Howler yet.
  if (raw.event_status === 'pending' || !raw.event_name || !raw.event_url) return null;

  const startsAt = parseSastTime(raw.event_start_time);
  if (!startsAt || startsAt < window.from || startsAt > window.to) return null;
  const endsAt = parseSastTime(raw.event_end_time) ?? startsAt;
  if (endsAt.getTime() - startsAt.getTime() > MAX_EVENT_SPAN_MS) return null;

  const country = COUNTRY_CODES[(raw.event_country ?? '').trim().toLowerCase()];
  if (!country || (window.markets.length > 0 && !window.markets.includes(country))) return null;

  const venue = raw.event_venue;
  const lat = Number(venue?.latitude);
  const lng = Number(venue?.longitude);
  if (!venue?.name || !lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const acts = findActs(raw.event_name, artists);
  if (acts.length === 0) return null;

  const tiers = raw.event_ticket_types ?? [];
  const currency = raw.event_currency || 'ZAR';
  const ticketOptions: NormalisedTicketOption[] = tiers
    .filter((tier) => {
      const closes = parseSastTime(tier.ticket_type_onsale_end_time);
      return !closes || closes > now;
    })
    .map((tier, index) => ({
      provider: 'howler' as const,
      tierName: tier.ticket_type_name?.trim().slice(0, 120) || `Ticket ${index + 1}`,
      // The webhook names its unit, unlike the API's bare `cost`: these are cents.
      priceMinor:
        typeof tier.ticket_type_cost_cents === 'number' ? tier.ticket_type_cost_cents : undefined,
      currency: tier.ticket_type_cost_currency || currency,
      availability: availabilityOf(tier),
      purchaseUrl: raw.event_url as string,
    }));

  const onSaleTimes = tiers
    .map((tier) => parseSastTime(tier.ticket_type_onsale_start_time))
    .filter((date): date is Date => date !== null)
    .map(Number);
  const firstOnSale = onSaleTimes.length > 0 ? new Date(Math.min(...onSaleTimes)) : null;
  const notYetOnSale = firstOnSale !== null && firstOnSale > now;

  return {
    sourceId: String(raw.event_id),
    source: 'howler',
    title: raw.event_name.trim(),
    startsAt,
    onSaleAt: notYetOnSale ? firstOnSale : undefined,
    status: statusOf(raw, ticketOptions, notYetOnSale),
    description: plainText(raw.event_details ?? undefined),
    posterImage: raw.event_header_image_url || undefined,
    sourceUrl: raw.event_url,
    venue: {
      name: venue.name.trim(),
      addressLine: venue.address?.trim() || undefined,
      // Howler gives coordinates and a one-line address but no city field.
      city: nearestCity({ lat, lng }) ?? cityFromAddress(venue.address) ?? 'Unknown',
      country,
      lat,
      lng,
      timezone: 'Africa/Johannesburg',
    },
    primaryArtist: { name: acts[0] as string },
    lineup: acts.map((name, index) => ({
      artist: { name },
      billingPosition: index,
      role: index === 0 ? ('headliner' as const) : ('support' as const),
    })),
    ticketOptions,
  };
}

function availabilityOf(tier: HowlerTicketType): TicketAvailability {
  const remaining = tier.ticket_type_remaining;
  if (typeof remaining !== 'number') return 'available';
  if (remaining <= 0) return 'sold_out';
  const quantity = tier.ticket_type_quantity;
  if (typeof quantity === 'number' && quantity > 0 && remaining / quantity <= LOW_STOCK_SHARE) {
    return 'low';
  }
  return 'available';
}

function statusOf(
  raw: HowlerEventPayload,
  tickets: NormalisedTicketOption[],
  notYetOnSale: boolean,
): EventStatus {
  if (raw.event_status === 'cancelled') return 'cancelled';
  const allGone = tickets.length > 0 && tickets.every((t) => t.availability === 'sold_out');
  if (raw.event_sold_out || allGone) return 'sold_out';
  if (notYetOnSale) return 'announced';
  if (tickets.some((t) => t.availability === 'low')) return 'low_stock';
  return 'on_sale';
}

/** "12 Long St, Cape Town, 8001" → "Cape Town": the last part that isn't a code. */
export function cityFromAddress(address?: string): string | null {
  const parts = (address ?? '').split(',').map((part) => part.trim());
  // A single part is a place name, not an address we can take a city from.
  if (parts.length < 2) return null;
  const named = parts.filter((part) => part && !/\d/.test(part) && !/^south africa$/i.test(part));
  return named.at(-1) ?? null;
}
