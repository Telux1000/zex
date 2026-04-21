'use client';

import { ThemeProvider } from '@/components/providers/theme-provider';
import { ToastProvider } from '@/components/feedback/toast/ToastProvider';
import { ClientStorageMigration } from '@/components/providers/ClientStorageMigration';
import { PaddleProvider } from '@/components/paddle/PaddleProvider';
import type { ThemeMode } from '@/lib/theme/constants';

export function AppProviders({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: ThemeMode | null;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <PaddleProvider>
        <ClientStorageMigration />
        <ToastProvider>{children}</ToastProvider>
      </PaddleProvider>
    </ThemeProvider>
  );
}
