import { fetchExchangeMultiplier } from '@/lib/currency/exchange-frankfurter';
import { amountsInBase, roundMoney2 } from '@/lib/currency/amounts-in-base';

export async function resolveExchangeRateToBase(
  invoiceCurrency: string,
  baseCurrency: string,
  manualRate?: number | null
): Promise<number> {
  const inv = (invoiceCurrency || 'USD').trim().toUpperCase();
  const base = (baseCurrency || 'USD').trim().toUpperCase();
  if (inv === base) return 1;
  if (manualRate != null && Number(manualRate) > 0) {
    return Number(manualRate);
  }
  return fetchExchangeMultiplier(inv, base);
}

export function buildInvoiceFxRow(
  baseCurrencyCode: string,
  rate: number,
  subtotal: number,
  taxAmount: number,
  total: number
) {
  const b = amountsInBase(subtotal, taxAmount, total, rate);
  return {
    base_currency_code: baseCurrencyCode,
    exchange_rate_to_base: rate,
    subtotal_in_base: b.subtotal_in_base,
    tax_amount_in_base: b.tax_amount_in_base,
    total_in_base: b.total_in_base,
  };
}

export function paymentAmountInBase(
  paymentAmount: number,
  paymentCurrency: string,
  invoiceCurrency: string,
  invoiceRateToBase: number,
  paymentToInvoiceRate?: number | null
): { amount_in_base: number; amount_in_invoice_currency: number | null; exchange_rate_to_invoice: number | null } {
  const payCur = (paymentCurrency || '').toUpperCase();
  const invCur = (invoiceCurrency || 'USD').toUpperCase();
  const invR = Number(invoiceRateToBase) > 0 ? Number(invoiceRateToBase) : 1;

  if (payCur === invCur) {
    const aib = roundMoney2(paymentAmount * invR);
    return {
      amount_in_base: aib,
      amount_in_invoice_currency: paymentAmount,
      exchange_rate_to_invoice: 1,
    };
  }

  const p2i =
    paymentToInvoiceRate != null && Number(paymentToInvoiceRate) > 0
      ? Number(paymentToInvoiceRate)
      : 1;
  const inInvoice = roundMoney2(paymentAmount * p2i);
  return {
    amount_in_base: roundMoney2(inInvoice * invR),
    amount_in_invoice_currency: inInvoice,
    exchange_rate_to_invoice: p2i,
  };
}
