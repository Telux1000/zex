'use client';

import { ThemeModeSegmented } from '@/components/theme/ThemeModeSegmented';

/** Fixed corner control so auth pages share the same theme UX as marketing and the app. */
export function AuthShellThemeSlot() {
  return (
    <div
      className="pointer-events-none fixed right-3 top-3 z-30 sm:right-4 sm:top-4"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="pointer-events-auto">
        <ThemeModeSegmented density="compact" />
      </div>
    </div>
  );
}
