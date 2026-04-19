'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  DASHBOARD_RANGE_OPTIONS,
  DASHBOARD_TZ_COOKIE,
  DEFAULT_DASHBOARD_RANGE,
  isDashboardRangePreset,
  parseDashboardRangeParam,
  readDashboardRangeFromStorage,
  writeDashboardRangeToStorage,
  type DashboardRangePreset,
} from '@/lib/dashboard/date-range';

export function DashboardHomeHeader({ firstName }: { firstName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const rawRange = searchParams.get('range');
  const preset = parseDashboardRangeParam(rawRange);
  const current =
    DASHBOARD_RANGE_OPTIONS.find((o) => o.value === preset) ?? DASHBOARD_RANGE_OPTIONS[0];

  useEffect(() => {
    if (isDashboardRangePreset(rawRange)) {
      writeDashboardRangeToStorage(rawRange);
      return;
    }
    if (rawRange === '7' || rawRange === '30' || rawRange === '90') {
      const mapped = parseDashboardRangeParam(rawRange);
      const p = new URLSearchParams(searchParams.toString());
      p.set('range', mapped);
      router.replace(`/dashboard?${p.toString()}`, { scroll: false });
      return;
    }
    if (rawRange == null) {
      const stored = readDashboardRangeFromStorage();
      const next = stored ?? DEFAULT_DASHBOARD_RANGE;
      if (next === DEFAULT_DASHBOARD_RANGE) return;
      const p = new URLSearchParams(searchParams.toString());
      p.set('range', next);
      router.replace(`/dashboard?${p.toString()}`, { scroll: false });
      return;
    }
    const p = new URLSearchParams(searchParams.toString());
    p.set('range', (readDashboardRangeFromStorage() ?? DEFAULT_DASHBOARD_RANGE));
    router.replace(`/dashboard?${p.toString()}`, { scroll: false });
  }, [rawRange, router, searchParams]);

  const setRange = useCallback(
    (value: DashboardRangePreset) => {
      writeDashboardRangeToStorage(value);
      const p = new URLSearchParams(searchParams.toString());
      p.set('range', value);
      router.push(`/dashboard?${p.toString()}`);
      setOpen(false);
    },
    [router, searchParams]
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && /^[A-Za-z_][A-Za-z0-9_/+.+-]*$/.test(tz)) {
        document.cookie = `${DASHBOARD_TZ_COOKIE}=${encodeURIComponent(tz)};path=/;max-age=31536000;SameSite=Lax`;
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="mb-6">
      <div className="flex flex-nowrap items-center justify-between gap-2 sm:gap-3 md:flex-wrap md:items-end md:justify-between md:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-white sm:text-xl md:overflow-visible md:whitespace-normal md:text-clip md:text-2xl">
            {firstName
              ? `Welcome back, ${firstName} 👋`
              : 'Welcome back 👋'}
          </h1>
          <p className="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 md:block">
            Here is your business overview today.
          </p>
        </div>
        <div className="relative shrink-0" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300/60 hover:bg-indigo-500/[0.04] sm:gap-2 sm:px-4 sm:text-sm dark:text-slate-200 dark:hover:border-indigo-500/30'
            )}
          >
            {current.label}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          {open && (
            <ul
              className="absolute right-0 top-full z-20 mt-2 min-w-[11rem] rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg shadow-slate-900/10 dark:shadow-black/50"
              role="listbox"
            >
              {DASHBOARD_RANGE_OPTIONS.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={current.value === o.value}
                    onClick={() => setRange(o.value)}
                    className={cn(
                      'w-full px-4 py-2 text-left text-sm transition-colors',
                      current.value === o.value
                        ? 'bg-indigo-500/10 font-medium text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-700 hover:bg-slate-500/[0.06] dark:text-slate-200'
                    )}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 md:hidden">
        Here is your business overview today.
      </p>
    </div>
  );
}
