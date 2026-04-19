import {
  resolvePaymentsReceivedTimeRange,
  type PaymentsNaturalRangeSpec,
  type ResolvedPaymentsTimeRange,
} from '@/lib/analytics/payments-received-time-range';

const ROLLING_DAYS_MIN = 1;
const ROLLING_DAYS_MAX = 366;

/**
 * "last 14 days", "past 7 days", "the previous 30 days", etc.
 * Inclusive window: N civil days ending today in workspace TZ (start = today − (N−1)).
 */
export function tryParseRollingDaysCount(lower: string): number | null {
  const m = /\b(?:the\s+)?(?:last|past|previous)\s+(\d{1,3})\s+days?\b/i.exec(lower);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < ROLLING_DAYS_MIN || n > ROLLING_DAYS_MAX) return null;
  return n;
}

/**
 * Map natural language to a calendar / rolling range (workspace TZ applied later).
 * Prefers narrower calendar windows before rolling N-day windows, then month.
 */
export function parseFinancialMetricRangeSpec(lower: string): PaymentsNaturalRangeSpec {
  if (/\byesterday\b/.test(lower)) return { kind: 'yesterday' };
  if (/\b(today)\b/.test(lower) && !/\bthis\s+week\b/.test(lower)) return { kind: 'today' };
  if (/\blast\s+month\b/.test(lower)) return { kind: 'last_month' };
  if (/\blast\s+week\b|\bpast\s+week\b|\bprevious\s+week\b/.test(lower)) return { kind: 'last_week' };
  if (/\bthis\s+week\b|\bcurrent\s+week\b/.test(lower)) return { kind: 'this_week' };

  const rolling = tryParseRollingDaysCount(lower);
  if (rolling != null) return { kind: 'rolling_days', days: rolling };

  if (/\bthis\s+month\b|\bmtd\b/i.test(lower)) return { kind: 'this_month' };
  return { kind: 'this_month' };
}

/**
 * True when the message clearly names a payments/collections time window (rolling, calendar, etc.).
 * Follow-ups like “break it down with invoice numbers” must NOT match — avoids defaulting to this month.
 */
export function userTextContainsExplicitPaymentsPeriod(lower: string): boolean {
  if (/\byesterday\b/.test(lower)) return true;
  if (/\b(today)\b/.test(lower) && !/\bthis\s+week\b/.test(lower)) return true;
  if (/\blast\s+month\b/.test(lower)) return true;
  if (/\blast\s+week\b|\bpast\s+week\b|\bprevious\s+week\b/.test(lower)) return true;
  if (/\bthis\s+week\b|\bcurrent\s+week\b/.test(lower)) return true;
  if (tryParseRollingDaysCount(lower) != null) return true;
  if (/\bthis\s+month\b|\bmtd\b/i.test(lower)) return true;
  return false;
}

/**
 * Resolve a range only when the user text actually specifies a period.
 * Returns null for neutral follow-ups so callers can fall back to `metric_session_context.paymentsWindow`.
 */
export function tryResolveFinancialDateRangeFromUserText(
  userText: string,
  workspaceTimezone: string | null | undefined,
  now = new Date()
): ResolvedPaymentsTimeRange | null {
  const lower = userText.trim().toLowerCase();
  if (!userTextContainsExplicitPaymentsPeriod(lower)) return null;
  return resolveFinancialDateRangeFromUserText(userText, workspaceTimezone, now);
}

/**
 * Single path from assistant text → resolved payment window (filters, titles, and date line).
 */
export function resolveFinancialDateRangeFromUserText(
  userText: string,
  workspaceTimezone: string | null | undefined,
  now = new Date()
): ResolvedPaymentsTimeRange | null {
  const spec = parseFinancialMetricRangeSpec(userText.trim().toLowerCase());
  const r = resolvePaymentsReceivedTimeRange(spec, now, workspaceTimezone);
  return r.ok ? r.value : null;
}

/** Title / card suffix: "last 14 days", "this month", etc. (no metric prefix). */
export function assistantAnalyticsPeriodTitleSuffix(w: ResolvedPaymentsTimeRange): string {
  const { label } = w;
  if (label === 'today') return 'today';
  if (label === 'yesterday') return 'yesterday';
  if (label === 'this_week') return 'this week';
  if (label === 'last_week') return 'last week';
  if (label === 'this_month') return 'this month';
  if (label === 'last_month') return 'last month';
  const m = /^past_(\d+)_days$/.exec(label);
  if (m) {
    const n = parseInt(m[1], 10);
    return `past ${n} day${n === 1 ? '' : 's'}`;
  }
  return w.humanRange;
}

/**
 * Phrase after “for …” in follow-up messages (`Break down revenue for …`).
 * Rolling windows use “the last N days” so the sentence reads naturally.
 */
export function assistantRevenueScopePhraseForMessage(w: ResolvedPaymentsTimeRange): string {
  const { label } = w;
  switch (label) {
    case 'today':
      return 'today';
    case 'yesterday':
      return 'yesterday';
    case 'this_week':
      return 'this week';
    case 'last_week':
      return 'last week';
    case 'this_month':
      return 'this month';
    case 'last_month':
      return 'last month';
    default: {
      const m = /^past_(\d+)_days$/.exec(label);
      if (m) return `the past ${m[1]} days`;
      return w.humanRange;
    }
  }
}
