import { availableRefundableAmount, roundRefundMoney } from '@/lib/invoices/refund-display';

/** Succeeded + pending refund rows (same rules as invoice detail + refund routes). */
export function sumRefundedSucceededAndPendingForInvoice(
  rows: Array<{ amount?: number | null; status?: string | null }> | null | undefined
): number {
  let sum = 0;
  for (const raw of rows ?? []) {
    const st = String(raw.status ?? '').toLowerCase();
    if (st !== 'succeeded' && st !== 'pending') continue;
    const amt = Number(raw.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    sum += amt;
  }
  return roundRefundMoney(sum);
}

/**
 * Canonical paid / refund totals for invoice UI and refund modal.
 * `totalPaid` uses `invoices.amount_paid` (same field as invoice preview / editor “Paid”).
 * Refunds aggregate `payment_refunds` for the invoice (succeeded + pending).
 */
export function canonicalInvoicePaymentRefundSummary(input: {
  invoiceAmountPaid: number | null | undefined;
  refundedSucceededAndPendingTotal: number | null | undefined;
}): {
  totalPaid: number;
  totalRefunded: number;
  refundableRemaining: number;
} {
  const totalPaid = roundRefundMoney(Math.max(0, Number(input.invoiceAmountPaid ?? 0)));
  const totalRefunded = roundRefundMoney(Math.max(0, Number(input.refundedSucceededAndPendingTotal ?? 0)));
  const refundableRemaining = availableRefundableAmount(totalPaid, totalRefunded);
  return { totalPaid, totalRefunded, refundableRemaining };
}
