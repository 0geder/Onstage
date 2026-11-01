import { normaliseName } from '@onstage/shared';
import type { EventStatus, TicketAvailability } from '@onstage/shared';
import { config } from '../config';
import { logger } from '../logger';
import { prisma } from '../prisma';
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

/**
 * Catalogue names too generic to identify an act inside free text: a band
 * called "Paradise" must not claim every party at Club Paradise.
 */
const GENERIC_NAMES = new Set([
  'and friends',
  'paradise',
  'the band',
  'live',
  'various artists',
  'halloween',
  'christmas',
  'unplugged',
  'acoustic',
  'tribute',
  'friends',
]);

/** Words that mark a title fragment as an event name rather than an act. */
const EVENT_WORDS =
  /\b(presents?|party|nights?|festival|fest|halloween|concert|tribute|evening|celebrat\w*|jol|show|launch|market|series|sessions?|edition|weekend|brunch|picnic|masquerade|gala|tour|experience|vol|fundraiser|hosted|carols|christmas|xmas|oktoberfest|undisclosed|secret|tba|tbc|recital|intimate|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d+(?:st|nd|rd|th))\b/i;

/** Words that introduce a billed act: "ft. Megalodon", "with Oscar Mbo". */
const BILLING_LEAD = /(?:^| )(?:ft|feat|featuring|with|w)$/;

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

/**
 * Quicket sends local wall-clock times with no offset ("2026-12-19T00:30:00").
 * `new Date()` would read those in the server's own zone — right on a laptop
 * set to SAST, two hours out on a UTC server. Every Quicket market here is
 * South African, and SAST has no daylight saving, so the offset is fixed.
 */
export function parseQuicketTime(value?: string): Date | null {
  if (!value) return null;
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasOffset ? value : `${value}+02:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function availabilityOf(ticket: QuicketTicket): TicketAvailability {
  if (ticket.soldOut) return 'sold_out';
  // Held in other people's baskets: may come back, but it is nearly gone.
  if (ticket.provisionallySoldOut) return 'low';
  return 'available';
}

/** normalised alias → canonical artist name, for catalogue artists only. */
type ArtistIndex = Map<string, string>;

async function loadArtistIndex(): Promise<ArtistIndex> {
  const rows = await prisma.artistAlias.findMany({
    select: { normalisedAlias: true, artist: { select: { name: true } } },
  });
  const index: ArtistIndex = new Map();
  for (const row of rows) {
    const alias = row.normalisedAlias;
    // Short or single-word names match inside unrelated titles ("Toss", "Dam").
    const distinctive = alias.length >= 6 && (alias.includes(' ') || alias.length >= 8);
    if (distinctive && !GENERIC_NAMES.has(alias)) index.set(alias, row.artist.name);
  }
  return index;
}

/** Acts named in a title: known artists first, else a "<act> at <place>" lead. */
export function findActs(title: string, artists: ArtistIndex): string[] {
  const padded = ` ${normaliseName(title)} `;
  const known: string[] = [];
  for (const [alias, name] of artists) {
    const at = padded.indexOf(` ${alias} `);
    if (at < 0 || known.includes(name)) continue;
    // A one-word name ("Revolution") only counts where a title bills an act:
    // at the start, or after "ft." / "with" — not as an ordinary word.
    if (!alias.includes(' ') && at > 0 && !BILLING_LEAD.test(padded.slice(0, at).trimEnd())) {
      continue;
    }
    known.push(name);
  }
  if (known.length > 0) {
    // Longest first: "Dr Victor & the Rasta Rebels" over a stray "Dr Victor".
    return known
      .sort((a, b) => b.length - a.length)
      .filter((name, i, all) => {
        const key = normaliseName(name);
        return !all.slice(0, i).some((longer) => normaliseName(longer).includes(key));
      });
  }

  return extractLeads(title);
}

function extractLeads(title: string): string[] {
  // "Slow Life presents Bokani Dyer at …" → the act follows "presents".
  const afterPresents = title.split(/\s+pres(?:ents|\.)\s+/i).pop() as string;
  const match = afterPresents.match(/^(.+?)\s+(?:live\s+)?(?:@|at)\s+\S/i);
  if (!match) return [];

  // "Fuzznights: Sueños | Phakathi" → the acts follow the series name, and a
  // pipe or comma separates them ("Gerhard Joubert, intimate solo recital").
  // After an event name ("30+ Party: Fright at the Prom") it is a theme instead.
  const segments = match[1].split(':');
  const billed = segments.pop() as string;
  if (segments.some((segment) => EVENT_WORDS.test(segment))) return [];
  return billed
    .split(/\s*[|,]\s*/)
    .map((part) =>
      part
        // "ABBA-SOLUTELY FABULOUS ft Aaron McIlroy" → the act is the featured name.
        .replace(/^.*\s(?:ft|feat|featuring)\.?\s+/i, '')
        .replace(/^and\s+/i, '')
        .replace(/[!–-]+$/g, '')
        .replace(/\s+live!?$/i, '')
        .trim(),
    )
    .filter(
      (act) =>
        act.length >= 3 &&
        act.split(/\s+/).length <= 5 &&
        !EVENT_WORDS.test(act) &&
        !/\d{4}/.test(act),
    )
    .map((act) => (isShouting(act) ? titleCase(act) : act));
}

function isShouting(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length > 3 && letters === letters.toUpperCase();
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, gap: string, c: string) => gap + c.toUpperCase());
}

/** Quicket descriptions are HTML; the app renders plain text. */
function plainText(html?: string): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>|<\/(p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
  return text ? text.slice(0, 4000) : undefined;
}
