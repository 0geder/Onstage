import type { MetadataRoute } from 'next';
import { WEB_BASE_URL } from '../lib/api';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Nothing here is private, but these paths have no standalone value and
      // would only dilute the crawl budget.
      disallow: ['/api/'],
    },
    sitemap: `${WEB_BASE_URL}/sitemap.xml`,
  };
}
