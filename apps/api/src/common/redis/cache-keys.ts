export const CacheKeys = {
  artist: (idOrSlug: string) => `artist:${idOrSlug}`,
  artistEvents: (id: string, scope: string) => `artist:${id}:events:${scope}`,
  similarArtists: (id: string) => `artist:${id}:similar`,
  event: (idOrSlug: string) => `event:${idOrSlug}`,
  eventPrefix: (id: string) => `event:${id}`,
  search: (query: string, limit: number) => `search:${query.toLowerCase()}:${limit}`,
  feedNearby: (lat: number, lng: number, radiusKm: number, page: string) =>
    `feed:near:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}:${page}`,
  feedWeekend: (city: string) => `feed:weekend:${city.toLowerCase()}`,
} as const;

export const CacheTtl = {
  artist: 300,
  artistEvents: 180,
  similarArtists: 900,
  event: 120,
  search: 60,
  feed: 120,
} as const;
