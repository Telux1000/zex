'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { persistThemeToClient } from '@/lib/theme/client-persist';
import type { ThemeMode } from '@/lib/theme/constants';
import { isThemeMode } from '@/lib/theme/constants';
import { readBrowserThemePreference } from '@/lib/theme/read-browser-theme';

type ThemeContextValue = {
  theme: ThemeMode;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemeMode) => void;
  toggleLightDark: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemDark() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveDark(t: ThemeMode): boolean {
  return t === 'dark' || (t === 'system' && getSystemDark());
}

function fallbackFromInitial(initialTheme?: ThemeMode | null): ThemeMode {
  return isThemeMode(initialTheme) ? initialTheme : 'system';
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: ThemeMode | null;
}) {
  const serverHint = fallbackFromInitial(initialTheme);
  const [theme, setThemeState] = useState<ThemeMode>(serverHint);

  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    resolveDark(serverHint) ? 'dark' : 'light'
  );

  const apply = useCallback((t: ThemeMode) => {
    const root = document.documentElement;
    const isDark = resolveDark(t);
    root.classList.toggle('dark', isDark);
    setResolved(isDark ? 'dark' : 'light');
  }, []);

  useLayoutEffect(() => {
    const stored = readBrowserThemePreference();
    const t = stored ?? fallbackFromInitial(initialTheme);
    setThemeState(t);
    apply(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time sync after ThemeBootScript
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, apply]);

  const persistRemote = useCallback(async (t: ThemeMode) => {
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: t }),
      });
      if (res.status === 401) return;
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = useCallback(
    (t: ThemeMode) => {
      setThemeState(t);
      persistThemeToClient(t);
      apply(t);
      void persistRemote(t);
    },
    [apply, persistRemote]
  );

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN') return;
      const local = readBrowserThemePreference();
      const t = isThemeMode(local) ? local : 'system';
      void persistRemote(t);
    });
    return () => subscription.unsubscribe();
  }, [persistRemote]);

  const toggleLightDark = useCallback(() => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolved, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggleLightDark }),
    [theme, resolved, setTheme, toggleLightDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
