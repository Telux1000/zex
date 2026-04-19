import { createClient } from '@/lib/supabase/server';
import type { ThemeMode } from '@/lib/theme/constants';
import { isThemeMode } from '@/lib/theme/constants';

/** Resolved theme from profiles.theme for the current session user, or null if anonymous. */
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
