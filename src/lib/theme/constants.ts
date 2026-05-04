export type ThemeMode = 'light' | 'dark' | 'system';

/** Primary localStorage key for theme mode. */
export const THEME_STORAGE_KEY = 'zenzex_theme';

/** Optional cookie for SSR and server-rendered first paint (non-sensitive). */
export const THEME_COOKIE_NAME = 'zenzex_theme';

/** Legacy keys — read only for one-time migration in boot script / `readStoredTheme`. */
export const THEME_STORAGE_KEY_LEGACY = 'zenzex-theme';
export const THEME_STORAGE_KEY_LEGACY_2 = 'theme';

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}
