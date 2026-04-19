import { amountsInBase, roundMoney2 } from '@/lib/currency/amounts-in-base';

export type InvoiceCurrencyFields = {
  status?: string | null;
  currency?: string | null;
  base_currency_code?: string | null;
  exchange_rate_to_base?: number | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  subtotal_in_base?: number | null;
  tax_amount_in_base?: number | null;
  total_in_base?: number | null;
};

function n(v: unknown, fallback = 0): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export function canEditInvoiceCurrency(invoice: Pick<InvoiceCurrencyFields, 'status'> | string): boolean {
  const st = typeof invoice === 'string' ? invoice : String(invoice.status ?? '');
  return st === 'draft';
}

export function normalizeInvoiceCurrencyFields(
  invoice: InvoiceCurrencyFields,
  baseCurrencyCode: string
): Required<Pick<
  InvoiceCurrencyFields,
  | 'currency'
  | 'base_currency_code'
  | 'exchange_rate_to_base'
  | 'subtotal'
  | 'tax_amount'
  | 'total'
  | 'subtotal_in_base'
  | 'tax_amount_in_base'
  | 'total_in_base'
>> {
  const base = String(invoice.base_currency_code ?? baseCurrencyCode ?? 'USD').toUpperCase();
  const cur = String(invoice.currency ?? base).toUpperCase();
  const subtotal = roundMoney2(n(invoice.subtotal));
  const tax = roundMoney2(n(invoice.tax_amount));
  const total = roundMoney2(n(invoice.total));
  const same = cur === base;
  let rate = n(invoice.exchange_rate_to_base, same ? 1 : 0);
  if (same) rate = 1;
  if (!same && rate <= 0) rate = 1;

  const calc = amountsInBase(subtotal, tax, total, rate);
  const subtotalInBase =
    invoice.subtotal_in_base != null ? roundMoney2(n(invoice.subtotal_in_base)) : calc.subtotal_in_base;
  const taxInBase =
    invoice.tax_amount_in_base != null ? roundMoney2(n(invoice.tax_amount_in_base)) : calc.tax_amount_in_base;
  const totalInBase =
    invoice.total_in_base != null ? roundMoney2(n(invoice.total_in_base)) : calc.total_in_base;

  return {
    currency: cur,
    base_currency_code: base,
    exchange_rate_to_base: rate,
    subtotal,
    tax_amount: tax,
    total,
    subtotal_in_base: subtotalInBase,
    tax_amount_in_base: taxInBase,
    total_in_base: totalInBase,
  };
}

export function recalculateInvoiceForCurrency(
  invoiceDraft: Pick<InvoiceCurrencyFields, 'subtotal' | 'tax_amount' | 'total' | 'base_currency_code'>,
  nextCurrencyCode: string,
  exchangeRate: number
) {
  const normalized = normalizeInvoiceCurrencyFields(
    {
      ...invoiceDraft,
      currency: nextCurrencyCode,
      exchange_rate_to_base: exchangeRate,
      subtotal_in_base: null,
      tax_amount_in_base: null,
      total_in_base: null,
    },
    String(invoiceDraft.base_currency_code ?? 'USD')
  );
  return normalized;
}

export function getInvoicePreviewCurrency(
  invoice: Pick<InvoiceCurrencyFields, 'currency' | 'base_currency_code'>,
  businessFallbackCurrency?: string
): string {
  const base = String(invoice.base_currency_code ?? businessFallbackCurrency ?? 'USD').toUpperCase();
  return String(invoice.currency ?? base).toUpperCase();
}

export function getInvoiceBaseAmounts(
  invoice: Pick<
    InvoiceCurrencyFields,
    | 'subtotal'
    | 'tax_amount'
    | 'total'
    | 'subtotal_in_base'
    | 'tax_amount_in_base'
    | 'total_in_base'
    | 'exchange_rate_to_base'
    | 'currency'
    | 'base_currency_code'
  >,
  baseCurrencyCode: string
) {
  const f = normalizeInvoiceCurrencyFields(invoice, baseCurrencyCode);
  return {
    subtotal_in_base: f.subtotal_in_base,
    tax_amount_in_base: f.tax_amount_in_base,
    total_in_base: f.total_in_base,
    exchange_rate_to_base: f.exchange_rate_to_base,
    base_currency_code: f.base_currency_code,
    currency: f.currency,
  };
}
