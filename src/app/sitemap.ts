import type { MetadataRoute } from 'next';

const appUrl = 'https://zenzex.com';

const PUBLIC_INDEXABLE_PATHS = ['/', '/privacy', '/terms', '/refunds'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_INDEXABLE_PATHS.map((path) => ({
    url: `${appUrl}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));
}
