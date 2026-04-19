import { describe, expect, it } from 'vitest';
import { resolvePaymentsReceivedTimeRange } from '@/lib/analytics/payments-received-time-range';
import {
  assistantAnalyticsPeriodTitleSuffix,
  assistantRevenueScopePhraseForMessage,
  parseFinancialMetricRangeSpec,
  resolveFinancialDateRangeFromUserText,
  tryParseRollingDaysCount,
  tryResolveFinancialDateRangeFromUserText,
  userTextContainsExplicitPaymentsPeriod,
} from '@/lib/business-assistant/financial-date-range-resolver';

describe('tryParseRollingDaysCount', () => {
  it('extracts N from last/past/previous X days', () => {
    expect(tryParseRollingDaysCount('revenue in the last 14 days')).toBe(14);
    expect(tryParseRollingDaysCount('past 7 days')).toBe(7);
    expect(tryParseRollingDaysCount('the previous 30 days')).toBe(30);
  });
});

describe('parseFinancialMetricRangeSpec', () => {
  it('uses rolling window for last 14 days instead of defaulting to this month', () => {
    const q = 'what is the revenue in the last 14 days?';
    expect(parseFinancialMetricRangeSpec(q.toLowerCase())).toEqual({ kind: 'rolling_days', days: 14 });
  });

  it('covers last 7, 14, 30', () => {
    expect(parseFinancialMetricRangeSpec('last 7 days')).toEqual({ kind: 'rolling_days', days: 7 });
    expect(parseFinancialMetricRangeSpec('past 14 days')).toEqual({ kind: 'rolling_days', days: 14 });
    expect(parseFinancialMetricRangeSpec('last 30 days')).toEqual({ kind: 'rolling_days', days: 30 });
    expect(parseFinancialMetricRangeSpec('previous 30 days')).toEqual({ kind: 'rolling_days', days: 30 });
  });

  it('resolves this month and last month', () => {
    expect(parseFinancialMetricRangeSpec('revenue this month')).toEqual({ kind: 'this_month' });
    expect(parseFinancialMetricRangeSpec('mtd')).toEqual({ kind: 'this_month' });
    expect(parseFinancialMetricRangeSpec('last month')).toEqual({ kind: 'last_month' });
  });
});

describe('resolveFinancialDateRangeFromUserText', () => {
  const tz = 'America/New_York';
  /** Noon UTC Apr 4, 2026 → still Apr 4 in New York (EDT). */
  const now = new Date('2026-04-04T12:00:00.000Z');

  it('last 14 days: inclusive civil window and title suffix', () => {
    const w = resolveFinancialDateRangeFromUserText('revenue last 14 days', tz, now);
    expect(w).not.toBeNull();
    expect(w!.label).toBe('past_14_days');
    expect(assistantAnalyticsPeriodTitleSuffix(w!)).toBe('past 14 days');
    expect(assistantRevenueScopePhraseForMessage(w!)).toBe('the past 14 days');
    expect(w!.humanRange).toBe('22 March 2026 – 4 April 2026');
    const direct = resolvePaymentsReceivedTimeRange({ kind: 'rolling_days', days: 14 }, now, tz);
    expect(direct.ok).toBe(true);
    expect(direct.ok && direct.value.startIso).toBe(w!.startIso);
    expect(direct.ok && direct.value.endIso).toBe(w!.endIso);
  });

  it('last 7 days and this month', () => {
    const w7 = resolveFinancialDateRangeFromUserText('last 7 days', tz, now);
    expect(w7?.label).toBe('past_7_days');
    expect(w7?.humanRange).toBe('29 March 2026 – 4 April 2026');

    const wm = resolveFinancialDateRangeFromUserText('revenue this month', tz, now);
    expect(wm?.label).toBe('this_month');
    expect(assistantAnalyticsPeriodTitleSuffix(wm!)).toBe('this month');
    expect(wm?.humanRange).toBe('1 April 2026 – 4 April 2026');
  });

  it('last month', () => {
    const w = resolveFinancialDateRangeFromUserText('revenue last month', tz, now);
    expect(w?.label).toBe('last_month');
    expect(assistantAnalyticsPeriodTitleSuffix(w!)).toBe('last month');
  });
});

describe('tryResolveFinancialDateRangeFromUserText', () => {
  const tz = 'America/New_York';
  const now = new Date('2026-04-04T12:00:00.000Z');

  it('returns null for invoice breakdown follow-ups without a period (no silent this_month)', () => {
    expect(userTextContainsExplicitPaymentsPeriod('break it down with the invoice numbers')).toBe(false);
    expect(tryResolveFinancialDateRangeFromUserText('break it down with the invoice numbers', tz, now)).toBe(
      null
    );
  });

  it('still resolves when the message includes an explicit rolling window', () => {
    const w = tryResolveFinancialDateRangeFromUserText(
      'break down by invoice for the past 90 days',
      tz,
      now
    );
    expect(w).not.toBeNull();
    expect(w!.label).toBe('past_90_days');
  });
});
