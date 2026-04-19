import { describe, expect, it } from 'vitest';
import {
  collectedByCurrencyRowsForTool,
  computeCollectedRevenueMetric,
  formatCollectedByCurrencyBreakdownLine,
} from '@/lib/payments/collected-revenue-metric';

describe('computeCollectedRevenueMetric', () => {
  it('aggregates leg amount and amount_in_base per currency from ledger payments', () => {
    const base = 'USD';
    const start = new Date('2025-01-01T00:00:00.000Z');
    const end = new Date('2025-12-31T23:59:59.999Z');
    const payments = [
      {
        id: 'p1',
        invoice_id: 'inv1',
        amount: 100,
        amount_in_base: 110,
        currency: 'EUR',
        exchange_rate_to_base: 1.1,
        status: 'succeeded',
        created_at: '2025-06-15T12:00:00.000Z',
        paid_at: '2025-06-15T12:00:00.000Z',
      },
      {
        id: 'p2',
        invoice_id: 'inv2',
        amount: 50,
        amount_in_base: 50,
        currency: 'USD',
        exchange_rate_to_base: 1,
        status: 'succeeded',
        created_at: '2025-06-15T13:00:00.000Z',
        paid_at: '2025-06-15T13:00:00.000Z',
      },
    ];

    const r = computeCollectedRevenueMetric(payments, [], base, start, end, {
      surface: 'assistant',
      fetchStartIso: start.toISOString(),
      rangeEndIso: end.toISOString(),
      timezone: 'UTC',
      dashboardPreset: null,
    });

    expect(r.totalBase).toBeCloseTo(160, 5);
    const eur = r.byCurrency.find((x) => x.currency === 'EUR');
    const usd = r.byCurrency.find((x) => x.currency === 'USD');
    expect(eur?.original_amount).toBe(100);
    expect(eur?.base_currency_equivalent).toBeCloseTo(110, 5);
    expect(usd?.original_amount).toBe(50);
    expect(usd?.base_currency_equivalent).toBeCloseTo(50, 5);
    const sumBase = r.byCurrency.reduce((s, x) => s + x.base_currency_equivalent, 0);
    expect(sumBase).toBeCloseTo(r.totalBase, 5);
  });

  it('breakdown_line preserves base-currency cents for tool copy (no whole-dollar rounding)', () => {
    const row = { currency: 'CNY', original_amount: 440, base_currency_equivalent: 63.67 };
    const line = formatCollectedByCurrencyBreakdownLine(row, 'USD');
    expect(line).toMatch(/\$63\.67/);
    expect(line).not.toMatch(/\$64\.00/);
    const [toolRow] = collectedByCurrencyRowsForTool([row], 'USD');
    expect(toolRow.breakdown_line).toBe(line);
  });
});
