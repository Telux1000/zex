import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppProviders } from '@/components/providers/app-providers';
import { ThemeBootScript } from '@/components/theme/ThemeBootScript';
import { getServerUserTheme } from '@/lib/theme/server';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'Zenzex – AI-Powered Invoicing & Business Intelligence',
  description:
    'Run your business conversationally. Create invoices via chat, voice, or screenshots. Your personal AI CFO.',
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
