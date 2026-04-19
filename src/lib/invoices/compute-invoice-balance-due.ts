import { roundMoney2 } from '@/lib/currency/amounts-in-base';

export type ResolveInvoiceBalanceInput = {
  status?: string | null;
  total?: number | null;
  /** Gross captured / recorded payments (before subtracting refunds for display). */
  amount_paid?: number | null;
  /** Cumulative refunds recorded for the invoice. */
  total_refunded?: number | null;
  /** When invoice rows store applied credit memos separately, pass the sum here. */
  appliedCredits?: number | null;
};

/**
 * Canonical remaining balance for customer-facing surfaces, email/PDF payloads, and reporting.
 * - voided / cancelled: 0
 * - fully refunded (`total_refunded >= amount_paid` and refund exists): 0
 * - otherwise: round(clamp(total − (amount_paid − total_refunded) − appliedCredits, 0, total))
 *   (`amount_paid` is gross paid; refunds reduce net paid and never inflate amount due)
 */
export function resolveInvoiceBalanceDue(input: ResolveInvoiceBalanceInput): number {
  const st = String(input.status ?? '').toLowerCase();
  if (st === 'voided' || st === 'cancelled') return 0;
  const total = Number(input.total ?? 0);
  const paid = Math.max(0, Number(input.amount_paid ?? 0));
  const credits = Math.max(0, Number(input.appliedCredits ?? 0));
  const refunded = Math.max(0, Number(input.total_refunded ?? 0));
  if (refunded > 0 && refunded >= paid) return 0;
  const netPaid = Math.max(0, paid - refunded);
  const unclamped = total - netPaid - credits;
  return roundMoney2(Math.min(Math.max(0, unclamped), Math.max(0, total)));
}

/**
 * Remaining balance from totals only (no status). Same formula as {@link resolveInvoiceBalanceDue} for open rows.
 * Prefer {@link resolveInvoiceBalanceDue} when `status` is available (void/cancelled).
 */
export function computeInvoiceBalanceDue(
  total: number,
  amountPaid: number,
  totalRefunded?: number | null
): number {
  return resolveInvoiceBalanceDue({ total, amount_paid: amountPaid, total_refunded: totalRefunded });
}
