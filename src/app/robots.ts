import type { MetadataRoute } from 'next';

const appUrl = 'https://zenzex.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/login',
          '/signup',
          '/signup/confirm',
          '/forgot-password',
          '/reset-password',
          '/auth/callback',
          '/pay/success',
          '/pay/cancel',
          '/dashboard-mockup',
          '/account-unavailable',
          '/admin',
          '/account',
          '/settings',
          '/billing',
          '/dashboard',
          '/onboarding',
          '/api/',
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
