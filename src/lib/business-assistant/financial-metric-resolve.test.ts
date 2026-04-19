import { describe, expect, it } from 'vitest';
import {
  looksLikeBusinessCollectedRevenueQuery,
  looksLikeInvoicedRevenueQuery,
  looksLikePaymentsCollectedQuery,
  resolveFinancialMetricIntent,
} from '@/lib/business-assistant/financial-metric-resolve';

describe('looksLikeBusinessCollectedRevenueQuery', () => {
  it('matches global revenue / collected phrasing including "made" and passive voice', () => {
    expect(looksLikeBusinessCollectedRevenueQuery('how much was made only last month?')).toBe(true);
    expect(looksLikeInvoicedRevenueQuery('revenue last month')).toBe(true);
    expect(looksLikePaymentsCollectedQuery('revenue last month')).toBe(false);
    expect(looksLikeBusinessCollectedRevenueQuery('revenue last month')).toBe(true);
    expect(looksLikePaymentsCollectedQuery('total paid last month')).toBe(true);
    expect(looksLikePaymentsCollectedQuery('how much did we collect last month')).toBe(true);
    expect(looksLikeBusinessCollectedRevenueQuery('how much did we earn in march')).toBe(true);
  });

  it('does not match single-invoice lookup phrasing', () => {
    expect(looksLikeBusinessCollectedRevenueQuery('show me invoice #12')).toBe(false);
    expect(looksLikeBusinessCollectedRevenueQuery('how much was the invoice for acme')).toBe(false);
  });

  it('matches everyday owner/CEO phrasing for money in / collections (came in, was paid, what came in)', () => {
    const phrases = [
      'how much came in today?',
      'how much was paid today?',
      'how much was paid to me today?',
      'how much did we collect today?',
      'how much have I received today?',
      'payments received today',
      'money in today',
      'what came in today?',
      'what got paid today?',
      'invoice paid yesterday',
      'invoices paid yesterday',
    ];
    for (const p of phrases) {
      expect(looksLikeBusinessCollectedRevenueQuery(p.toLowerCase()), p).toBe(true);
    }
  });

  it('matches collected amounts / by-currency phrasing (plural amounts; not only \\bamount\\b)', () => {
    expect(looksLikePaymentsCollectedQuery('show collected amounts by currency for last week')).toBe(true);
    expect(looksLikeBusinessCollectedRevenueQuery('show collected amounts by currency for last week')).toBe(true);
    expect(looksLikePaymentsCollectedQuery('collected by currency this month')).toBe(true);
    expect(looksLikePaymentsCollectedQuery('money received by currency')).toBe(true);
    expect(looksLikePaymentsCollectedQuery('show collections by currency')).toBe(true);
  });
});

describe('resolveFinancialMetricIntent', () => {
  it('maps revenue / sales phrasing to revenue_invoiced (invoice totals by issue date)', () => {
    expect(resolveFinancialMetricIntent('revenue last month')).toEqual({
      kind: 'revenue_invoiced',
      rangeSpec: { kind: 'last_month' },
    });
    expect(resolveFinancialMetricIntent('sales this week')).toEqual({
      kind: 'revenue_invoiced',
      rangeSpec: { kind: 'this_week' },
    });
  });

  it('maps payments / collection phrasing to revenue_collected with last_month', () => {
    const phrases = [
      'how much was made only last month?',
      'total paid last month',
      'how much did we collect last month',
    ];
    for (const text of phrases) {
      expect(resolveFinancialMetricIntent(text)).toEqual({
        kind: 'revenue_collected',
        rangeSpec: { kind: 'last_month' },
      });
    }
  });

  it('maps natural “money in today” questions to revenue_collected with today', () => {
    const expectToday = {
      kind: 'revenue_collected' as const,
      rangeSpec: { kind: 'today' as const },
    };
    expect(resolveFinancialMetricIntent('how much came in today?')).toEqual(expectToday);
    expect(resolveFinancialMetricIntent('how much was paid today?')).toEqual(expectToday);
    expect(resolveFinancialMetricIntent('how much was paid to me today?')).toEqual(expectToday);
  });

  it('maps "invoice paid yesterday" to collected revenue for yesterday', () => {
    expect(resolveFinancialMetricIntent('invoice paid yesterday')).toEqual({
      kind: 'revenue_collected',
      rangeSpec: { kind: 'yesterday' },
    });
    expect(resolveFinancialMetricIntent('invoices paid yesterday')).toEqual({
      kind: 'revenue_collected',
      rangeSpec: { kind: 'yesterday' },
    });
  });

  it('maps partially paid workspace count', () => {
    expect(resolveFinancialMetricIntent('how many partially paid invoices do i have')).toEqual({
      kind: 'partially_paid_invoice_count',
    });
  });

  it('maps partially paid detail when user asks for totals, paid, or balance', () => {
    expect(resolveFinancialMetricIntent('show the total, paid and balance of the partially paid invoices')).toEqual({
      kind: 'partially_paid_invoice_detail',
    });
    expect(resolveFinancialMetricIntent('list my partially paid invoices')).toEqual({
      kind: 'partially_paid_invoice_detail',
    });
  });

  it('prefers detail over count when how many is combined with balance or list wording', () => {
    expect(
      resolveFinancialMetricIntent('how many partially paid invoices and what is the balance on each')
    ).toEqual({ kind: 'partially_paid_invoice_detail' });
  });
});
