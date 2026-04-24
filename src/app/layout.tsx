import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppProviders } from '@/components/providers/app-providers';
import { ThemeBootScript } from '@/components/theme/ThemeBootScript';
import { warnIfProductionAppUrlMisconfigured } from '@/lib/config/app-url-startup-warning';
import { getServerUserTheme } from '@/lib/theme/server';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' });
const metadataBase = new URL('https://zenzex.com');
const defaultTitle = 'Zenzex | Simple Automated Invoicing';
const defaultDescription =
  'Create invoices faster, track payments clearly, and stay on top of revenue with simple automated invoicing.';

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: defaultTitle,
    template: '%s | Zenzex',
  },
  description: defaultDescription,
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    url: 'https://zenzex.com',
    siteName: 'Zenzex',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Zenzex | Simple Automated Invoicing' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: defaultDescription,
    images: ['/twitter-image'],
  },
  icons: {
    icon: [{ url: '/zenzex-mark.png', type: 'image/png' }],
    shortcut: '/zenzex-mark.png',
    apple: [{ url: '/zenzex-mark.png', type: 'image/png' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  warnIfProductionAppUrlMisconfigured();
  const serverTheme = await getServerUserTheme();
  const initialSurface = serverTheme === 'dark' ? '#0c111d' : '#f6f8fc';
  const initialScheme = serverTheme === 'dark' ? 'dark' : 'light';

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <style>{`
          html { background: ${initialSurface}; color-scheme: ${initialScheme}; }
          html.dark { background: #0c111d; color-scheme: dark; }
          @media (prefers-color-scheme: dark) {
            html { background: #0c111d; color-scheme: dark; }
          }
          .theme-preload *, .theme-preload *::before, .theme-preload *::after {
            transition: none !important;
            animation: none !important;
          }
          body { background: transparent; }
        `}</style>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{document.documentElement.classList.add('theme-preload');requestAnimationFrame(function(){requestAnimationFrame(function(){document.documentElement.classList.remove('theme-preload');});});}catch(e){}})();",
          }}
        />
        <ThemeBootScript serverTheme={serverTheme} />
      </head>
      <body className="min-h-screen antialiased font-sans">
        <AppProviders initialTheme={serverTheme}>{children}</AppProviders>
      </body>
    </html>
  );
}
