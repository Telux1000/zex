export type RefundDisplayStatus = 'refunded' | 'partially_refunded';

/** Matches `/api/invoices/[id]/refund` GET/POST invoice status gate. */
export const INVOICE_REFUND_ROUTE_STATUSES = new Set([
  'paid',
  'partially_paid',
  'partially_refunded',
  'refunded',
]);

export const REFUND_UI_EPS = 0.0001;

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** ISO-like currency code; empty/whitespace falls back to USD so refund matching is not thrown off. */
export function normalizeCurrencyForRefund(code: string | null | undefined): string {
  const t = String(code ?? '').trim();
  return (t.length > 0 ? t : 'USD').toUpperCase();
}

export function roundRefundMoney(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

/**
 * Gross captured amount for one succeeded payment row, in invoice currency.
 * When payment currency matches the invoice, `amount` (charge total in that currency) is
 * authoritative so a bad `amount_in_invoice_currency` snapshot cannot understate refunds
 * (e.g. confusing balance-due style values with paid totals).
 * When currencies differ, prefer a positive converted `amount_in_invoice_currency`, then `amount`.
 */
export function succeededPaymentGrossInInvoiceCurrency(
  payment: {
    amount: number | string | null | undefined;
    amount_in_invoice_currency?: number | string | null | undefined;
    currency?: string | null | undefined;
  },
  invoiceCurrency: string | null | undefined
): number {
  const invCur = normalizeCurrencyForRefund(invoiceCurrency);
  const payCur = normalizeCurrencyForRefund(payment.currency);
  const amt = safeNumber(payment.amount);
  const aicRaw = payment.amount_in_invoice_currency;
  const aic = aicRaw != null && aicRaw !== '' ? safeNumber(aicRaw) : NaN;

  if (payCur === invCur) {
    if (amt > REFUND_UI_EPS && Number.isFinite(aic) && aic > REFUND_UI_EPS) {
      return roundRefundMoney(Math.max(amt, aic));
    }
    if (amt > REFUND_UI_EPS) return roundRefundMoney(amt);
    if (Number.isFinite(aic) && aic > REFUND_UI_EPS) return roundRefundMoney(aic);
    return 0;
  }

  if (Number.isFinite(aic) && aic > REFUND_UI_EPS) return roundRefundMoney(aic);
  if (amt > REFUND_UI_EPS) return roundRefundMoney(amt);
  return 0;
}

/** Remaining balance that can still be refunded (invoice currency), aligned with refund API. */
export function availableRefundableAmount(originalPaid: number, refundedSoFar: number): number {
  return roundRefundMoney(Math.max(0, safeNumber(originalPaid) - Math.max(0, safeNumber(refundedSoFar))));
}

export function invoiceStatusAllowsRefundRoute(status: string | null | undefined): boolean {
  return INVOICE_REFUND_ROUTE_STATUSES.has(String(status ?? '').toLowerCase());
}

/** True when any refund rows (succeeded or pending) have already reduced the remainder. */
export function hasPriorInvoiceRefunds(refundedSoFar: number | null | undefined): boolean {
  return Math.max(0, safeNumber(refundedSoFar)) > REFUND_UI_EPS;
}

/**
 * Whether to show the Refund entry point (menus). Uses the same inputs as GET `/refund`:
 * succeeded payment gross vs succeeded+pending refund total; refundable remainder must be positive.
 */
export function canShowRefundMenuAction(input: {
  status: string | null | undefined;
  grossPaidSucceeded: number | null | undefined;
  refundedSucceededAndPending: number | null | undefined;
}): boolean {
  if (!invoiceStatusAllowsRefundRoute(input.status)) return false;
  const gross = roundRefundMoney(safeNumber(input.grossPaidSucceeded));
  if (gross <= REFUND_UI_EPS) return false;
  const refunded = roundRefundMoney(safeNumber(input.refundedSucceededAndPending));
  const available = availableRefundableAmount(gross, refunded);
  return available > REFUND_UI_EPS;
}

export function resolveRefundDisplayStatus(input: {
  grossPaidAmount: number | null | undefined;
  refundedAmount: number | null | undefined;
}): RefundDisplayStatus | null {
  const grossPaid = Math.max(0, safeNumber(input.grossPaidAmount));
  const refunded = Math.max(0, safeNumber(input.refundedAmount));
  if (grossPaid <= 0.0001 || refunded <= 0.0001) return null;
  if (refunded >= grossPaid - 0.0001) return 'refunded';
  return 'partially_refunded';
}

export function applyRefundDisplayStatus(baseStatus: string, refundStatus: RefundDisplayStatus | null): string {
  if (!refundStatus) return baseStatus;
  return refundStatus;
}
