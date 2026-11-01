/**
 * Logos for the services Onstage links out to, from /public/brands (the same
 * set the app bundles). Always paired with the service's name in text.
 */
const BRANDS = new Set([
  'spotify',
  'apple_music',
  'youtube',
  'soundcloud',
  'audiomack',
  'uber',
  'bolt',
  'indrive',
  'google_maps',
  'ticketmaster',
  'quicket',
  'webtickets',
  'computicket',
  'howler',
  'facebook',
  'instagram',
  'tiktok',
  'twitch',
]);

/** Display names for streaming platforms keyed as the API sends them. */
export const STREAMING_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  audiomack: 'Audiomack',
};

export function BrandIcon({ brand, size = 20 }: { brand: string; size?: number }) {
  if (!BRANDS.has(brand)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static icon; next/image adds nothing here
    <img className="brand-icon" src={`/brands/${brand}.png`} alt="" width={size} height={size} />
  );
}
