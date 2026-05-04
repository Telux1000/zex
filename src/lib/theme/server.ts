import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { ThemeMode } from '@/lib/theme/constants';
import { isThemeMode, THEME_COOKIE_NAME } from '@/lib/theme/constants';

/** `profiles.theme` for the signed-in user, or null if anonymous / unset. */
export async function getServerUserTheme(): Promise<ThemeMode | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('profiles').select('theme').eq('id', user.id).maybeSingle();
    const t = data?.theme;
    return isThemeMode(t) ? t : null;
  } catch {
    return null;
  }
}

/** Theme from `zenzex_theme` cookie (SSR hint). */
export async function getServerThemeCookie(): Promise<ThemeMode | null> {
  try {
    const raw = (await cookies()).get(THEME_COOKIE_NAME)?.value;
    return isThemeMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Server-side hint for initial React state (no access to localStorage).
 * Precedence matches the head boot script when localStorage is empty: cookie, then profile.
 */
export async function getServerBootstrapTheme(): Promise<ThemeMode | null> {
  const cookie = await getServerThemeCookie();
  if (cookie) return cookie;
  return getServerUserTheme();
}
