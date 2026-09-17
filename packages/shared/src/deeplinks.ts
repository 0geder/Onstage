import type { GeoPoint } from './types';

/**
 * Outbound deep links.
 *
 * Onstage never books a ride and never takes a payment — every function here
 * produces a URL that hands the user off to the provider's own app or site.
 * Each provider exposes an app scheme and a web fallback: try the scheme, and
 * if the OS reports it cannot be opened, use the fallback.
 *
 * Provider URL formats drift. Re-check these against current provider
 * documentation before each release.
 */

export interface RideDestination extends GeoPoint {
  /** Shown in the provider app as the destination label. */
  nickname: string;
  formattedAddress?: string;
}

export interface DeepLinkPair {
  /** Custom scheme — opens the installed app directly. */
  app: string;
  /** Universal/web URL — works when the app is not installed. */
  web: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/** Uber: pickup is left as `my_location` so the rider's device supplies it. */
export function uberLink(dest: RideDestination, clientId?: string): DeepLinkPair {
  const params = {
    action: 'setPickup',
    pickup: 'my_location',
    'dropoff[latitude]': dest.lat,
    'dropoff[longitude]': dest.lng,
    'dropoff[nickname]': dest.nickname,
    'dropoff[formatted_address]': dest.formattedAddress,
    client_id: clientId,
  };
  return {
    app: `uber://?${qs(params)}`,
    web: `https://m.uber.com/ul/?${qs(params)}`,
  };
}

/** Bolt: the larger operator in South Africa, so it is offered alongside Uber, not beneath it. */
export function boltLink(dest: RideDestination): DeepLinkPair {
  const params = {
    action: 'setPickup',
    pickup: 'my_location',
    'destination[latitude]': dest.lat,
    'destination[longitude]': dest.lng,
    'destination[nickname]': dest.nickname,
  };
  return {
    app: `bolt://action/setPickup?${qs(params)}`,
    web: `https://bolt.eu/mobile-deeplink/?${qs(params)}`,
  };
}

export function googleMapsDirections(dest: GeoPoint, placeId?: string): DeepLinkPair {
  const params = {
    api: '1',
    destination: `${dest.lat},${dest.lng}`,
    destination_place_id: placeId,
    travelmode: 'driving',
  };
  const web = `https://www.google.com/maps/dir/?${qs(params)}`;
  return {
    app: `comgooglemaps://?daddr=${dest.lat},${dest.lng}&directionsmode=driving`,
    web,
  };
}

export function appleMapsDirections(dest: GeoPoint, name?: string): DeepLinkPair {
  const params = { daddr: `${dest.lat},${dest.lng}`, q: name, dirflg: 'd' };
  const url = `http://maps.apple.com/?${qs(params)}`;
  return { app: url, web: url };
}

/** Artist pages on the streaming services. We link out; we never host audio. */
export function spotifyArtistLink(spotifyId: string): DeepLinkPair {
  return {
    app: `spotify:artist:${spotifyId}`,
    web: `https://open.spotify.com/artist/${spotifyId}`,
  };
}

/** Embeddable preview player. Only used where the licence permits an embed. */
export function spotifyArtistEmbed(spotifyId: string): string {
  return `https://open.spotify.com/embed/artist/${spotifyId}`;
}

/** Shareable deep link into a single comment in an event thread. */
export function eventThreadCommentUrl(
  baseUrl: string,
  eventId: string,
  commentId: string,
): string {
  return `${baseUrl.replace(/\/$/, '')}/event/${eventId}#comment-${commentId}`;
}

/**
 * Canonical public web URLs.
 *
 * Every artist and event has a server-rendered, crawlable page. Those pages are
 * the main source of off-platform discovery, so these URLs are the ones that go
 * into share cards, sitemaps and JSON-LD — never an app-only deep link.
 */
export function publicArtistUrl(webBaseUrl: string, slug: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}/artist/${slug}`;
}

export function publicEventUrl(webBaseUrl: string, slug: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}/event/${slug}`;
}

/** The app-scheme equivalent, used by the web page to hand off to an installed app. */
export function appArtistLink(slug: string): string {
  return `onstage://artist/${slug}`;
}

export function appEventLink(slug: string): string {
  return `onstage://event/${slug}`;
}

/** Share URL with the referral source attached, so shares are attributable. */
export function shareUrl(canonicalUrl: string, source: string, referralCode?: string): string {
  const url = new URL(canonicalUrl);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'share');
  if (referralCode) url.searchParams.set('ref', referralCode);
  return url.toString();
}
