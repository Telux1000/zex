'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import type { ThemeMode } from '@/lib/theme/constants';
import { cn } from '@/lib/utils/cn';

const btnBase =
  'flex shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-400';

type Props = {
  className?: string;
  /** Tighter padding for nav bars (landing / dashboard). */
  density?: 'default' | 'compact';
  /** Visually hidden label for the group (buttons stay named). */
  'aria-label'?: string;
  /** Runs after the theme is applied (e.g. settings toast). */
  onApplied?: (mode: ThemeMode) => void;
  /** Optional id of a visible label element (`aria-labelledby`). */
  labelledBy?: string;
};

export function ThemeModeSegmented({
  className,
  density = 'default',
  'aria-label': ariaLabel = 'Color theme',
  onApplied,
  labelledBy,
}: Props) {
  const { theme, setTheme } = useTheme();
  const pad = density === 'compact' ? 'p-0.5' : 'p-1';
  const size = density === 'compact' ? 'h-8 w-8' : 'h-9 w-9';

  function pick(next: ThemeMode) {
    setTheme(next);
    onApplied?.(next);
  }

  return (
    <div
      role="group"
      aria-label={labelledBy ? undefined : ariaLabel}
      aria-labelledby={labelledBy}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-slate-200/90 bg-slate-50/90 shadow-sm dark:border-slate-700/90 dark:bg-slate-900/60',
        pad,
        className
      )}
    >
      <button
        type="button"
        onClick={() => pick('light')}
        aria-pressed={theme === 'light'}
        title="Light"
        className={cn(
          btnBase,
          size,
          theme === 'light'
            ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
            : 'hover:bg-white/80 hover:text-slate-800 dark:hover:bg-slate-800/80 dark:hover:text-slate-100'
        )}
      >
        <Sun className="h-[1.05rem] w-[1.05rem]" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Light</span>
      </button>
      <button
        type="button"
        onClick={() => pick('dark')}
        aria-pressed={theme === 'dark'}
        title="Dark"
        className={cn(
          btnBase,
          size,
          theme === 'dark'
            ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
            : 'hover:bg-white/80 hover:text-slate-800 dark:hover:bg-slate-800/80 dark:hover:text-slate-100'
        )}
      >
        <Moon className="h-[1.05rem] w-[1.05rem]" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Dark</span>
      </button>
      <button
        type="button"
        onClick={() => pick('system')}
        aria-pressed={theme === 'system'}
        title="System"
        className={cn(
          btnBase,
          size,
          theme === 'system'
            ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
            : 'hover:bg-white/80 hover:text-slate-800 dark:hover:bg-slate-800/80 dark:hover:text-slate-100'
        )}
      >
        <Monitor className="h-[1.05rem] w-[1.05rem]" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">System</span>
      </button>
    </div>
  );
}
