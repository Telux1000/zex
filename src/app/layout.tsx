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

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeBootScript serverTheme={serverTheme} />
      </head>
      <body className="min-h-screen antialiased font-sans">
        <AppProviders initialTheme={serverTheme}>{children}</AppProviders>
      </body>
    </html>
  );
}
