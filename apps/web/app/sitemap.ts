import type { MetadataRoute } from 'next';
import { WEB_BASE_URL } from '../lib/api';

/**
 * Sitemap.
 *
 * Served from a dedicated API endpoint rather than by walking the database, so
 * the website stays a pure consumer of the API. Upcoming events change priority
 * as they approach; past events stay indexed because they carry the artist's
 * history and the recap thread.
 */
export const revalidate = 3600;

interface SitemapEntry {
  slug: string;
  updatedAt: string;
  startsAt?: string;
}

async function fetchIndex(path: string): Promise<SitemapEntry[]> {
  try {
    const base = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const response = await fetch(`${base}/v1${path}`, { next: { revalidate } });
    if (!response.ok) return [];
    return (await response.json()) as SitemapEntry[];
  } catch {
    // A sitemap missing entries is recoverable; a 500 that makes crawlers back
    // off is not.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [artists, events] = await Promise.all([
    fetchIndex('/sitemap/artists'),
    fetchIndex('/sitemap/events'),
  ]);

  const now = new Date();

  return [
    { url: WEB_BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    ...artists.map((artist) => ({
      url: `${WEB_BASE_URL}/artist/${artist.slug}`,
      lastModified: new Date(artist.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...events.map((event) => {
      const upcoming = event.startsAt ? new Date(event.startsAt) > now : false;
      return {
        url: `${WEB_BASE_URL}/event/${event.slug}`,
        lastModified: new Date(event.updatedAt),
        changeFrequency: (upcoming ? 'daily' : 'monthly') as 'daily' | 'monthly',
        priority: upcoming ? 0.9 : 0.4,
      };
    }),
  ];
}
