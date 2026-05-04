import type { ThemeMode } from '@/lib/theme/constants';
import {
  isThemeMode,
  THEME_STORAGE_KEY,
  THEME_STORAGE_KEY_LEGACY,
  THEME_STORAGE_KEY_LEGACY_2,
} from '@/lib/theme/constants';

/** Reads persisted theme from localStorage (browser only). */
export function readBrowserThemePreference(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored =
      localStorage.getItem(THEME_STORAGE_KEY) ??
      localStorage.getItem(THEME_STORAGE_KEY_LEGACY_2) ??
      localStorage.getItem(THEME_STORAGE_KEY_LEGACY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}
