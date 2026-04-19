import { isSupportedCurrency } from '@/lib/currency/supported';
import { getBusinessBaseCurrency } from '@/lib/business/base-currency';

export { getBusinessBaseCurrency } from '@/lib/business/base-currency';

function normalizeCode(code: string | null | undefined): string {
  return String(code ?? '').trim().toUpperCase();
}

/**
 * Operational billing currency: customer preference when set and supported, else company base.
 */
export function resolveCustomerOperationalCurrency(
  customer: { preferred_currency_code?: string | null } | null | undefined,
  businessBase: string
): string {
  const base = normalizeCode(businessBase) || 'USD';
  const p = normalizeCode(customer?.preferred_currency_code ?? null);
  if (p && isSupportedCurrency(p)) return p;
  return isSupportedCurrency(base) ? base : 'USD';
}

/**
 * Transaction currency for an invoice: explicit document override wins, then customer preference, then base.
 */
export function resolveInvoiceTransactionCurrency(opts: {
  businessBase: string;
  customerPreferred?: string | null;
  invoiceCurrencyOverride?: string | null;
}): string {
  const ov = normalizeCode(opts.invoiceCurrencyOverride ?? null);
  if (ov && isSupportedCurrency(ov)) return ov;
  return resolveCustomerOperationalCurrency(
    { preferred_currency_code: opts.customerPreferred },
    opts.businessBase
  );
}
