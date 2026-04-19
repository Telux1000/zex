import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import {
  formatDashboardDateKey,
  formatDateRangeForDisplay,
  isSafeIanaTimeZone,
  shiftGregorianDateYmd,
} from '@/lib/dashboard/date-range';

/** Structured intent for “how much was received” queries (server resolves to instants). */
export type PaymentsReceivedMetric = 'payments_received_base';

export type PaymentsNaturalRangeSpec =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'this_week' }
  | { kind: 'last_week' }
  | { kind: 'this_month' }
  | { kind: 'last_month' }
  | { kind: 'rolling_days'; days: number }
  | {
      kind: 'last_named_weekday';
      weekday: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    }
  | { kind: 'explicit_calendar_range'; start: string; end: string; year?: number };

export type ResolvedPaymentsTimeRange = {
  metric: PaymentsReceivedMetric;
  /** Inclusive lower bound in UTC for `payments.created_at >=` */
  startIso: string;
  /** Inclusive upper bound in UTC for `payments.created_at <=` */
  endIso: string;
  /** IANA zone used when resolving civil dates */
  timezone: string;
  /** Short description of the resolved window */
  label: string;
  /** Same window, phrased for end users */
  humanRange: string;
  aggregation: 'sum';
};

/**
 * Upper bound for “collected” math aligned with the main dashboard: open-ended periods use a
 * fresh `Date()` after DB reads so rows created during the request still count; closed periods
 * use the resolved civil end instant.
 */
export function collectionQueryUpperBound(resolved: ResolvedPaymentsTimeRange): Date {
  if (
    resolved.label === 'today' ||
    resolved.label === 'this_week' ||
    resolved.label === 'this_month' ||
    resolved.label.startsWith('past_')
  ) {
    return new Date();
  }
  return new Date(resolved.endIso);
}

const WEEKDAY_TO_ISO: Record<
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
  number
> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const MONTH_ALIASES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function normalizeTz(tz: string | null | undefined): string {
  if (tz && isSafeIanaTimeZone(tz)) return tz;
  return 'UTC';
}

function ymdAtStartOfDayUtcIso(ymd: string, tz: string): string {
  return fromZonedTime(`${ymd}T00:00:00.000`, tz).toISOString();
}

function ymdAtEndOfDayUtcIso(ymd: string, tz: string): string {
  return fromZonedTime(`${ymd}T23:59:59.999`, tz).toISOString();
}

function todayYmdInTz(now: Date, tz: string): string {
  return formatDashboardDateKey(now, tz);
}

function formatRangeHuman(startIso: string, endIso: string, tz: string): string {
  return formatDateRangeForDisplay(startIso, endIso, tz, 'detailed');
}

function parseMonthDayLoose(raw: string, defaultYear: number): { y: number; m0: number; d: number } | null {
  const s = raw.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  const m = /^([a-z]+)\s+(\d{1,2})$/i.exec(s);
  if (!m) return null;
  const mon = MONTH_ALIASES[m[1].toLowerCase()];
  if (mon == null) return null;
  const d = parseInt(m[2], 10);
  if (d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(defaultYear, mon, d));
  if (dt.getUTCMonth() !== mon || dt.getUTCDate() !== d) return null;
  return { y: defaultYear, m0: mon, d };
}

function toYmd(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Turn a validated natural-language range spec into absolute UTC bounds.
 * All civil dates are interpreted in `workspaceTimezone` (dashboard / request cookie).
 */
export function resolvePaymentsReceivedTimeRange(
  spec: PaymentsNaturalRangeSpec,
  now: Date,
  workspaceTimezone?: string | null
):
  | { ok: true; value: ResolvedPaymentsTimeRange }
  | { ok: false; error: string } {
  const tz = normalizeTz(workspaceTimezone ?? undefined);
  const todayYmd = todayYmdInTz(now, tz);
  const refYear = parseInt(formatInTimeZone(now, tz, 'yyyy'), 10);

  try {
    switch (spec.kind) {
      case 'today': {
        const startIso = ymdAtStartOfDayUtcIso(todayYmd, tz);
        const endIso = now.toISOString();
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: 'today',
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      case 'yesterday': {
        const ymd = shiftGregorianDateYmd(todayYmd, -1);
        const startIso = ymdAtStartOfDayUtcIso(ymd, tz);
        const endIso = ymdAtEndOfDayUtcIso(ymd, tz);
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: 'yesterday',
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      case 'this_week': {
        const isoD = Number(formatInTimeZone(fromZonedTime(`${todayYmd}T12:00:00`, tz), tz, 'i'));
        const daysFromMon = isoD - 1;
        const monYmd = shiftGregorianDateYmd(todayYmd, -daysFromMon);
        const startIso = ymdAtStartOfDayUtcIso(monYmd, tz);
        const endIso = now.toISOString();
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: 'this_week',
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      case 'last_week': {
        const isoD = Number(formatInTimeZone(fromZonedTime(`${todayYmd}T12:00:00`, tz), tz, 'i'));
        const daysFromMon = isoD - 1;
        const thisMon = shiftGregorianDateYmd(todayYmd, -daysFromMon);
        const lastMon = shiftGregorianDateYmd(thisMon, -7);
        const lastSun = shiftGregorianDateYmd(thisMon, -1);
        const startIso = ymdAtStartOfDayUtcIso(lastMon, tz);
        const endIso = ymdAtEndOfDayUtcIso(lastSun, tz);
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: 'last_week',
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      case 'this_month': {
        const startYmd = `${todayYmd.slice(0, 7)}-01`;
        const startIso = ymdAtStartOfDayUtcIso(startYmd, tz);
        const endIso = now.toISOString();
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: 'this_month',
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      case 'last_month': {
        const [ty, tm] = todayYmd.split('-').map((x) => parseInt(x, 10));
        let ly = ty;
        let lm = tm - 1;
        if (lm < 1) {
          lm = 12;
          ly -= 1;
        }
        const startYmd = `${ly}-${String(lm).padStart(2, '0')}-01`;
        const lastD = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
        const endYmd = `${ly}-${String(lm).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
        const startIso = ymdAtStartOfDayUtcIso(startYmd, tz);
        const endIso = ymdAtEndOfDayUtcIso(endYmd, tz);
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: 'last_month',
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      case 'rolling_days': {
        const n = Math.floor(spec.days);
        if (n < 1 || n > 366) {
          return { ok: false, error: 'Rolling window must be between 1 and 366 days.' };
        }
        const startYmd = shiftGregorianDateYmd(todayYmd, -(n - 1));
        const startIso = ymdAtStartOfDayUtcIso(startYmd, tz);
        const endIso = now.toISOString();
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: `past_${n}_days`,
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      case 'last_named_weekday': {
        const target = WEEKDAY_TO_ISO[spec.weekday];
        let ymd = shiftGregorianDateYmd(todayYmd, -1);
        let found = false;
        for (let i = 0; i < 400; i++) {
          const d = Number(formatInTimeZone(fromZonedTime(`${ymd}T12:00:00`, tz), tz, 'i'));
          if (d === target) {
            found = true;
            break;
          }
          ymd = shiftGregorianDateYmd(ymd, -1);
        }
        if (!found) {
          return { ok: false, error: 'Could not resolve last weekday in range.' };
        }
        const startIso = ymdAtStartOfDayUtcIso(ymd, tz);
        const endIso = ymdAtEndOfDayUtcIso(ymd, tz);
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: `last_${spec.weekday}`,
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      case 'explicit_calendar_range': {
        const year = spec.year ?? refYear;
        const a = parseMonthDayLoose(spec.start, year);
        const b = parseMonthDayLoose(spec.end, year);
        if (!a || !b) {
          return {
            ok: false,
            error:
              'Could not parse that date range. Use month names and days (e.g. March 1 to March 15) and include a year if it is not the current year.',
          };
        }
        const startYmd = toYmd(a.y, a.m0, a.d);
        let endYmd = toYmd(b.y, b.m0, b.d);
        if (startYmd > endYmd) {
          return { ok: false, error: 'The end date must be on or after the start date.' };
        }
        const startIso = ymdAtStartOfDayUtcIso(startYmd, tz);
        const endIso = ymdAtEndOfDayUtcIso(endYmd, tz);
        return {
          ok: true,
          value: {
            metric: 'payments_received_base',
            startIso,
            endIso,
            timezone: tz,
            label: 'explicit_range',
            humanRange: formatRangeHuman(startIso, endIso, tz),
            aggregation: 'sum',
          },
        };
      }
      default:
        return { ok: false, error: 'Unsupported date range.' };
    }
  } catch {
    return { ok: false, error: 'Failed to resolve the date range safely.' };
  }
}

export function shouldTryPaymentsReceivedTimeQuestion(question: string): boolean {
  const q = question.toLowerCase();
  const moneyish =
    (/\b(how much|total|amount)\b/i.test(q) &&
      /\b(received|collected|paid|payment|payments|cash in|income)\b/i.test(q)) ||
    /\bhow much\b.*\b(been\s+)?(received|collected)\b/i.test(q);
  const timeish =
    /\b(today|yesterday|this week|last week|this month|last month|past \d+|last (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|between|from|to|through|–|-|—)\b/i.test(
      q
    ) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(
      q
    );
  return moneyish && timeish;
}
