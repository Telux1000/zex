'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';

export function ThemeToggle() {
  const { resolved, toggleLightDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleLightDark}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-colors hover:border-[var(--card-border)] hover:bg-indigo-500/[0.06] hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300"
      aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {resolved === 'dark' ? (
        <Sun className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
      ) : (
        <Moon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
      )}
    </button>
  );
}
