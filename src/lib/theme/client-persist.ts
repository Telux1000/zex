'use client';

import type { ThemeMode } from '@/lib/theme/constants';
import { THEME_COOKIE_NAME, THEME_STORAGE_KEY } from '@/lib/theme/constants';

/** Persists theme to localStorage and a first-party cookie (SameSite=Lax, no secrets). */
export function persistThemeToClient(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* private mode / quota */
  }
  try {
    document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(mode)};path=/;max-age=31536000;SameSite=Lax`;
  } catch {
    /* ignore */
  }
}
