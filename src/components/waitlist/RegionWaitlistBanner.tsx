'use client';

import { useEffect, useState } from 'react';
import { useWaitlistUi } from '@/components/waitlist/waitlist-context';

function parseGeoPromptCountries(): string[] {
  const raw = process.env.NEXT_PUBLIC_WAITLIST_GEO_PROMPT_COUNTRIES?.trim() ?? '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length === 2);
}

/**
 * Optional banner when the visitor's geo country is listed in
 * `NEXT_PUBLIC_WAITLIST_GEO_PROMPT_COUNTRIES` (ISO2, comma-separated).
 * Does not render when the env list is empty.
 */
export function RegionWaitlistBanner({ active }: { active: boolean }) {
  const { openWaitlist } = useWaitlistUi();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) return;
    const codes = parseGeoPromptCountries();
    if (codes.length === 0) return;
    let cancelled = false;
    void fetch('/api/geo/country')
      .then((r) => r.json() as Promise<{ countryCode?: string | null }>)
      .then((j) => {
        const cc = (j.countryCode ?? '').toUpperCase();
        if (cancelled || !cc || !codes.includes(cc)) return;
        setShow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!active || !show) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100"
    >
      <p className="font-medium">Zenzex is not fully available in your region yet.</p>
      <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/85">
        Join the waitlist to hear when billing and checkout support your country.
      </p>
      <button
        type="button"
        className="mt-3 w-full rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 sm:w-auto sm:px-4 dark:bg-amber-700 dark:hover:bg-amber-600"
        onClick={() =>
          openWaitlist({
            triggerReason: 'region_unavailable',
            source: 'region_block',
          })
        }
      >
        Join waitlist
      </button>
    </div>
  );
}
