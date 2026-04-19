import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const DASHBOARD_RANGE_STORAGE_KEY = 'zenzex.dashboard.financialRange';

/** Cookie set by the dashboard header from `Intl` so server-side ranges match the user’s calendar. */
export const DASHBOARD_TZ_COOKIE = 'zenzex_dashboard_tz';

export type DashboardRangePreset = 'this_month' | 'last_7_days' | 'last_90_days';

export const DASHBOARD_RANGE_PRESETS: readonly DashboardRangePreset[] = [
  'this_month',
  'last_7_days',
  'last_90_days',
] as const;

export const DEFAULT_DASHBOARD_RANGE: DashboardRangePreset = 'this_month';

export const DASHBOARD_RANGE_OPTIONS: {
  label: string;
  value: DashboardRangePreset;
}[] = [
  { label: 'This Month', value: 'this_month' },
  { label: 'Last 7 days', value: 'last_7_days' },
  { label: 'Last 90 days', value: 'last_90_days' },
];

export function isDashboardRangePreset(v: string | undefined | null): v is DashboardRangePreset {
  return v === 'this_month' || v === 'last_7_days' || v === 'last_90_days';
}

/** URL ?range= + localStorage restore; maps legacy 7 / 30 / 90 to presets. */
export function parseDashboardRangeParam(raw: string | undefined | null): DashboardRangePreset {
  if (isDashboardRangePreset(raw)) return raw;
  if (raw === '7') return 'last_7_days';
  if (raw === '90') return 'last_90_days';
  if (raw === '30') return 'this_month';
  return DEFAULT_DASHBOARD_RANGE;
}

export function readDashboardRangeFromStorage(): DashboardRangePreset | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(DASHBOARD_RANGE_STORAGE_KEY);
    return isDashboardRangePreset(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeDashboardRangeToStorage(preset: DashboardRangePreset): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DASHBOARD_RANGE_STORAGE_KEY, preset);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Reads the dashboard TZ cookie set by `DashboardHomeHeader` (client only). */
export function readDashboardTimezoneFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${DASHBOARD_TZ_COOKIE}=`;
  const parts = document.cookie.split(';');
  for (const p of parts) {
    const s = p.trim();
    if (!s.startsWith(prefix)) continue;
    const raw = s.slice(prefix.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw || null;
    }
  }
  return null;
}

/**
 * Prefer dashboard cookie; otherwise the browser’s IANA zone so Insights matches “today” without
 * visiting the main dashboard first.
 */
export function getClientDashboardTimezone(): string | null {
  const fromCookie = readDashboardTimezoneFromCookie();
  if (fromCookie && isSafeIanaTimeZone(fromCookie)) return fromCookie;
  if (typeof Intl !== 'undefined') {
    try {
      const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (z && isSafeIanaTimeZone(z)) return z;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export type DashboardFinancialRange = {
  preset: DashboardRangePreset;
  /** Lower bound for `gte('created_at', …)` (inclusive). */
  startIso: string;
  /** Snapshot of `now` when the range was built — for labels only. Server pages should use a fresh `Date()` after loading rows when filtering payments/events so “today” is not clipped. */
  endIso: string;
  label: string;
};

export type DateRangeDisplayStyle = 'compact' | 'detailed';

/** Local YYYY-MM-DD (matches typical `expense_date` columns). */
export function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isSafeIanaTimeZone(tz: string): boolean {
  if (!tz || tz.length > 100) return false;
  return /^[A-Za-z_][A-Za-z0-9_/+.+-]*$/.test(tz);
}

/** Shift a Gregorian calendar YYYY-MM-DD by `deltaDays` (uses UTC date math; stable for range labels). */
export function shiftGregorianDateYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const u = new Date(Date.UTC(y, m - 1, d));
  u.setUTCDate(u.getUTCDate() + deltaDays);
  const yy = u.getUTCFullYear();
  const mm = String(u.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(u.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Civil YYYY-MM-DD minus N Gregorian days (for rolling windows in a user TZ). */
function gregorianYmdMinusDays(ymd: string, days: number): string {
  return shiftGregorianDateYmd(ymd, -days);
}

/**
 * YYYY-MM-DD for instant `d` in `ianaTimeZone`, or host-local date if tz missing/invalid.
 */
export function formatDashboardDateKey(d: Date, ianaTimeZone?: string | null): string {
  if (ianaTimeZone && isSafeIanaTimeZone(ianaTimeZone)) {
    return formatInTimeZone(d, ianaTimeZone, 'yyyy-MM-dd');
  }
  return formatLocalDateKey(d);
}

/**
 * User-visible date span (e.g. `Mar 29 – Apr 4`). Uses `ianaTimeZone` only for calendar
 * conversion — does not show the zone name (backend still resolves bounds in that zone).
 */
export function formatDateRangeForDisplay(
  startIso: string,
  endIso: string,
  ianaTimeZone: string,
  style: DateRangeDisplayStyle = 'compact'
): string {
  const tz = isSafeIanaTimeZone(ianaTimeZone) ? ianaTimeZone : 'UTC';
  const a = new Date(startIso);
  const b = new Date(endIso);
  if (style === 'detailed') {
    const detailedFmt = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: tz,
    });
    const left = detailedFmt.format(a);
    const right = detailedFmt.format(b);
    if (left === right) return left;
    return `${left} – ${right}`;
  }
  const yA = formatInTimeZone(a, tz, 'yyyy');
  const yB = formatInTimeZone(b, tz, 'yyyy');
  const sameYear = yA === yB;
  const o: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' as const }),
    timeZone: tz,
  };
  const left = a.toLocaleDateString('en-US', o);
  const right = b.toLocaleDateString('en-US', o);
  if (left === right) return left;
  return `${left} – ${right}`;
}

export function formatFinancialRangeForDisplay(
  financialRange: Pick<DashboardFinancialRange, 'preset' | 'startIso' | 'endIso'>,
  ianaTimeZone: string
): string {
  const dateSpan = formatDateRangeForDisplay(
    financialRange.startIso,
    financialRange.endIso,
    ianaTimeZone
  );
  if (financialRange.preset === 'this_month') {
    return `Month to date (${dateSpan})`;
  }
  return dateSpan;
}

export function revenueKpiTitle(financialRange: DashboardFinancialRange): string {
  switch (financialRange.preset) {
    case 'this_month':
      return 'Revenue (This Month)';
    case 'last_7_days':
      return 'Revenue (Last 7 Days)';
    case 'last_90_days':
      return 'Revenue (Last 90 Days)';
    default:
      return 'Revenue';
  }
}

/**
 * Financial window for dashboard queries.
 * - With `ianaTimeZone` (from cookie): start-of-day bounds use that zone’s calendar (fixes UTC vs “today”).
 * - Without tz: Node/Vercel host local calendar (often UTC).
 * - last_7_days: today + previous 6 civil days in that zone, inclusive.
 * - last_90_days: today + previous 89 civil days, inclusive.
 */
export function getDashboardFinancialRange(
  preset: DashboardRangePreset,
  now: Date = new Date(),
  ianaTimeZone?: string | null
): DashboardFinancialRange {
  const end = now;

  if (ianaTimeZone && isSafeIanaTimeZone(ianaTimeZone)) {
    const tz = ianaTimeZone;
    const todayYmd = formatInTimeZone(now, tz, 'yyyy-MM-dd');
    let startYmd: string;
    if (preset === 'this_month') {
      startYmd = `${todayYmd.slice(0, 7)}-01`;
    } else if (preset === 'last_7_days') {
      startYmd = gregorianYmdMinusDays(todayYmd, 6);
    } else {
      startYmd = gregorianYmdMinusDays(todayYmd, 89);
    }
    const start = fromZonedTime(`${startYmd}T00:00:00.000`, tz);
    if (preset === 'this_month') {
      return {
        preset,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: 'This month',
      };
    }
    if (preset === 'last_7_days') {
      return {
        preset,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: 'Last 7 days',
      };
    }
    return {
      preset: 'last_90_days',
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      label: 'Last 90 days',
    };
  }

  const start = new Date(now);

  if (preset === 'this_month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return {
      preset,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      label: 'This month',
    };
  }
  if (preset === 'last_7_days') {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return {
      preset,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      label: 'Last 7 days',
    };
  }
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 89);
  return {
    preset: 'last_90_days',
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: 'Last 90 days',
  };
}
