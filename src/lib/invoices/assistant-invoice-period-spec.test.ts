import { describe, expect, it } from 'vitest';
import {
  looksLikeAssistantTimeRangeCapture,
  parseAssistantPaidPeriodSpec,
} from '@/lib/invoices/assistant-invoice-period-spec';

describe('parseAssistantPaidPeriodSpec', () => {
  it('parses rolling past/last N days including “for the past”', () => {
    expect(parseAssistantPaidPeriodSpec('for the past 90 days')).toEqual({
      kind: 'rolling_days',
      days: 90,
    });
    expect(parseAssistantPaidPeriodSpec('in the last 30 days')).toEqual({
      kind: 'rolling_days',
      days: 30,
    });
    expect(parseAssistantPaidPeriodSpec('previous 14 days')).toEqual({
      kind: 'rolling_days',
      days: 14,
    });
  });

  it('parses calendar presets', () => {
    expect(parseAssistantPaidPeriodSpec('this month')).toEqual({ kind: 'this_month' });
    expect(parseAssistantPaidPeriodSpec('last week')).toEqual({ kind: 'last_week' });
  });

  it('parses explicit day-month-year ranges', () => {
    expect(parseAssistantPaidPeriodSpec('9 April 2026 to 14 April 2026')).toEqual({
      kind: 'explicit_calendar_range',
      start: 'April 9',
      end: 'April 14',
      year: 2026,
    });
  });
});

describe('looksLikeAssistantTimeRangeCapture', () => {
  it('flags strings that must not be treated as customer names', () => {
    expect(looksLikeAssistantTimeRangeCapture('the past 90 days?')).toBe(true);
    expect(looksLikeAssistantTimeRangeCapture('9 April 2026 to 14 April 2026')).toBe(true);
    expect(looksLikeAssistantTimeRangeCapture('Acme Corp')).toBe(false);
  });
});
