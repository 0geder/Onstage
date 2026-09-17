import type { Artist, ArtistSummary, EventDetail, EventSummary, Paginated } from '@onstage/shared';

/**
 * Server-side API access for the public website.
 *
 * These pages are rendered on the server and crawled by search engines, so they
 * are fetched without a user token and cached by Next rather than by the
 * browser. A failed fetch returns null and the page renders a 404 — a crawler
 * must never index an error page as if it were content.
 */

const API_BASE = `${(process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/v1`;

/** Revalidation windows, chosen by how fast the thing behind them actually moves. */
export const REVALIDATE = {
  /** Ticket availability changes constantly. */
  event: 300,
  /** Bio and images change rarely; upcoming dates less rarely. */
  artist: 900,
  sitemap: 3600,
} as const;

async function get<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      next: { revalidate },
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // The API being down must not render a broken page into the index.
    return null;
  }
}

export function getArtist(slug: string) {
  return get<Artist>(`/artists/${encodeURIComponent(slug)}`, REVALIDATE.artist);
}

export function getArtistEvents(artistId: string, scope: 'upcoming' | 'past') {
  return get<Paginated<EventSummary>>(
    `/artists/${artistId}/events?scope=${scope}&limit=20`,
    REVALIDATE.artist,
  );
}

export function getSimilarArtists(artistId: string) {
  return get<ArtistSummary[]>(`/artists/${artistId}/similar?limit=8`, REVALIDATE.artist);
}

export function getEvent(slug: string) {
  return get<EventDetail>(`/events/${encodeURIComponent(slug)}`, REVALIDATE.event);
}

export interface TravelLinks {
  directions: { google: { web: string }; apple: { web: string } };
  rides: { bolt: { web: string }; uber: { web: string } };
  disclaimer: string;
}

export function getTravel(eventId: string) {
  return get<TravelLinks>(`/events/${eventId}/travel`, REVALIDATE.artist);
}

export const WEB_BASE_URL = (
  process.env.NEXT_PUBLIC_WEB_BASE_URL ?? 'http://localhost:3002'
).replace(/\/$/, '');

export const STORE_LINKS = {
  ios: process.env.NEXT_PUBLIC_APP_STORE_URL ?? '#',
  android: process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '#',
};
