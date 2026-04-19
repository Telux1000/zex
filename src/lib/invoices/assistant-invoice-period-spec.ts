import type { PaymentsNaturalRangeSpec } from '@/lib/analytics/payments-received-time-range';

/**
 * Map natural-language time phrases to the same specs used for payments-received analytics.
 * Used by invoice assistant paid-in-period and balance-in-period intents.
 */
export function parseAssistantPaidPeriodSpec(lower: string): PaymentsNaturalRangeSpec | null {
  const t = lower.trim();
  if (!t) return null;

  const monthNames =
    '(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)';
  const dayMonthYear = new RegExp(
    `\\b(\\d{1,2})\\s+${monthNames}\\s+(\\d{4})\\s+(?:to|through|thru|-)\\s+(\\d{1,2})\\s+${monthNames}\\s+(\\d{4})\\b`,
    'i'
  );
  const m = t.match(dayMonthYear);
  if (m) {
    const d1 = Number(m[1]);
    const mon1 = String(m[2]);
    const y1 = Number(m[3]);
    const d2 = Number(m[4]);
    const mon2 = String(m[5]);
    const y2 = Number(m[6]);
    if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31 && y1 === y2) {
      return {
        kind: 'explicit_calendar_range',
        start: `${mon1} ${d1}`,
        end: `${mon2} ${d2}`,
        year: y1,
      };
    }
  }

  if (/\blast\s+month\b/.test(t)) return { kind: 'last_month' };
  if (/\blast\s+7\s+days\b|\bpast\s+7\s+days\b|\bprevious\s+7\s+days\b/.test(t)) {
    return { kind: 'rolling_days', days: 7 };
  }
  if (/\b(last\s+week|past\s+week|previous\s+week)\b/.test(t)) return { kind: 'last_week' };
  if (/\b(this\s+week|current\s+week)\b/.test(t)) return { kind: 'this_week' };
  if (/\b(this\s+month|month\s+to\s+date|mtd)\b/.test(t)) return { kind: 'this_month' };
  if (/\b(today|issued\s+today)\b/.test(t)) return { kind: 'today' };

  const roll = t.match(
    /\b(?:for\s+the\s+)?(?:past|last|in\s+the\s+last|previous)\s+(\d{1,3})\s+days?\b/i
  );
  if (roll) {
    const n = parseInt(roll[1]!, 10);
    if (n >= 1 && n <= 366) return { kind: 'rolling_days', days: n };
  }

  return null;
}

/**
 * True when a captured “customer” string is really a date range (e.g. from `invoices for …`).
 */
export function looksLikeAssistantTimeRangeCapture(raw: string): boolean {
  const s = raw
    .replace(/^["']|["']$/g, '')
    .replace(/\?+$/, '')
    .trim()
    .toLowerCase();
  if (s.length < 2) return false;
  if (parseAssistantPaidPeriodSpec(s)) return true;
  if (/^(?:the\s+)?(?:past|last|previous)\s+\d{1,3}\s+days?$/i.test(s)) return true;
  if (/^\d{1,3}\s+days?$/i.test(s)) return true;
  if (/\b(this|last)\s+month\b/i.test(s)) return true;
  if (/\b(this|last|past)\s+week\b/i.test(s)) return true;
  return false;
}
