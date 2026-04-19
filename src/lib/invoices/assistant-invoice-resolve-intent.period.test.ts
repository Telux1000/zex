import { describe, expect, it } from 'vitest';
import { resolveInvoiceAssistantIntent } from '@/lib/invoices/assistant-invoice-resolve-intent';

describe('resolveInvoiceAssistantIntent — paid + period (rolling days)', () => {
  it('parses total paid amount for rolling window (not customer search)', () => {
    expect(
      resolveInvoiceAssistantIntent('what is total amount of paid invoice for the past 90 days?')
    ).toEqual({
      type: 'paid_in_period',
      period: { kind: 'rolling_days', days: 90 },
      presentation: 'total',
    });
  });

  it('parses how many paid invoices in last N days', () => {
    expect(resolveInvoiceAssistantIntent('how many paid invoices in the last 30 days')).toEqual({
      type: 'paid_in_period',
      period: { kind: 'rolling_days', days: 30 },
      presentation: 'count',
    });
  });

  it('parses how much was paid without the word “invoice”', () => {
    expect(resolveInvoiceAssistantIntent('how much was paid in the last 30 days')).toEqual({
      type: 'paid_in_period',
      period: { kind: 'rolling_days', days: 30 },
      presentation: 'total',
    });
  });

  it('parses “paid from invoices” phrasing', () => {
    expect(resolveInvoiceAssistantIntent('how much was paid from invoices this month')).toEqual({
      type: 'paid_in_period',
      period: { kind: 'this_month' },
      presentation: 'total',
    });
  });

  it('parses which paid invoices this month as list', () => {
    expect(resolveInvoiceAssistantIntent('which paid invoices this month')).toEqual({
      type: 'paid_in_period',
      period: { kind: 'this_month' },
      presentation: 'list',
    });
  });

  it('does not route time phrase after “invoice for” to find_customer', () => {
    const r = resolveInvoiceAssistantIntent(
      'what is total amount of paid invoice for the past 90 days?'
    );
    expect(r).not.toEqual(expect.objectContaining({ type: 'find_customer' }));
  });
});

describe('resolveInvoiceAssistantIntent — unpaid balance + period', () => {
  it('parses total unpaid invoice amount this month', () => {
    expect(resolveInvoiceAssistantIntent('total unpaid invoice amount this month')).toEqual({
      type: 'balance_in_period',
      filter: 'unpaid',
      period: { kind: 'this_month' },
      presentation: 'total',
    });
  });

  it('parses explicit calendar range unpaid list to balance_in_period', () => {
    expect(resolveInvoiceAssistantIntent('show unpaid invoices 9 April 2026 to 14 April 2026')).toEqual({
      type: 'balance_in_period',
      filter: 'unpaid',
      period: {
        kind: 'explicit_calendar_range',
        start: 'april 9',
        end: 'april 14',
        year: 2026,
      },
      presentation: 'list',
    });
  });
});
