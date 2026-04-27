import { roundMoney2 } from '@/lib/currency/amounts-in-base';

export type ExpenseFxFields = {
  amount?: number | string | null | undefined;
  currency?: string | null | undefined;
  base_amount?: number | string | null | undefined;
  base_currency?: string | null | undefined;
  exchange_rate?: number | string | null | undefined;
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** ISO code for the entered amount; NULL/empty legacy rows use business base. */
export function expenseOriginalCurrency(row: ExpenseFxFields, businessBaseCurrency: string): string {
  const raw = row.currency != null ? String(row.currency).trim() : '';
  if (raw) return raw.toUpperCase();
  return (businessBaseCurrency || 'USD').trim().toUpperCase() || 'USD';
}

/**
 * Amount in business base for reporting (insights, notifications, filters in base).
 * Legacy rows: currency/base_amount NULL → amount is already base.
 */
export function expenseAmountInBase(row: ExpenseFxFields, businessBaseCurrency: string): number {
  const base = (businessBaseCurrency || 'USD').trim().toUpperCase() || 'USD';
  const ba = num(row.base_amount);
  if (Number.isFinite(ba) && ba >= 0) return Math.max(0, roundMoney2(ba));

  const amt = num(row.amount);
  if (!Number.isFinite(amt)) return 0;

  const cur = expenseOriginalCurrency(row, base);
  if (cur === base) return Math.max(0, roundMoney2(amt));

  const rate = num(row.exchange_rate);
  if (Number.isFinite(rate) && rate > 0) return Math.max(0, roundMoney2(amt * rate));

  return Math.max(0, roundMoney2(amt));
}

/** Persisted FX columns for insert/update (rate = base per 1 unit of `currency`). */
export function buildExpenseFxColumns(
  amount: number,
  expenseCurrency: string,
  baseCurrency: string,
  exchangeRate: number
): {
  currency: string;
  base_currency: string;
  exchange_rate: number;
  base_amount: number;
} {
  const cur = (expenseCurrency || '').trim().toUpperCase() || 'USD';
  const base = (baseCurrency || 'USD').trim().toUpperCase() || 'USD';
  const r = Number(exchangeRate);
  if (cur === base) {
    return {
      currency: cur,
      base_currency: base,
      exchange_rate: 1,
      base_amount: roundMoney2(amount),
    };
  }
  if (!Number.isFinite(r) || r <= 0) {
    throw new Error('Invalid exchange rate');
  }
  return {
    currency: cur,
    base_currency: base,
    exchange_rate: r,
    base_amount: roundMoney2(amount * r),
  };
}
