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
import type { ThemeMode } from '@/lib/theme/constants';
import {
  isThemeMode,
  THEME_STORAGE_KEY,
  THEME_STORAGE_KEY_LEGACY,
} from '@/lib/theme/constants';

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

function readStoredTheme(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) ?? localStorage.getItem(THEME_STORAGE_KEY_LEGACY);
    if (isThemeMode(stored)) return stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: ThemeMode | null;
}) {
  const serverDefault: ThemeMode = isThemeMode(initialTheme) ? initialTheme : 'light';
  const [theme, setThemeState] = useState<ThemeMode>(serverDefault);

  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    resolveDark(serverDefault) ? 'dark' : 'light'
  );

  const apply = useCallback((t: ThemeMode) => {
    const root = document.documentElement;
    const isDark = resolveDark(t);
    root.classList.toggle('dark', isDark);
    setResolved(isDark ? 'dark' : 'light');
  }, []);

  useLayoutEffect(() => {
    const stored = readStoredTheme();
    const t = stored ?? (isThemeMode(initialTheme) ? initialTheme : null) ?? 'light';
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
      try {
        localStorage.setItem(THEME_STORAGE_KEY, t);
        localStorage.setItem(THEME_STORAGE_KEY_LEGACY, t);
      } catch {
        /* ignore */
      }
      apply(t);
      void persistRemote(t);
    },
    [apply, persistRemote]
  );

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event !== 'SIGNED_IN') return;
      try {
        const res = await fetch('/api/profile');
        if (!res.ok) return;
        const data = await res.json();
        const t = (data.profile as { theme?: unknown } | undefined)?.theme;
        if (isThemeMode(t)) {
          setThemeState(t);
          try {
            localStorage.setItem(THEME_STORAGE_KEY, t);
            localStorage.setItem(THEME_STORAGE_KEY_LEGACY, t);
          } catch {
            /* ignore */
          }
          apply(t);
        }
      } catch {
        /* ignore */
      }
    });
    return () => subscription.unsubscribe();
  }, [apply]);

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
