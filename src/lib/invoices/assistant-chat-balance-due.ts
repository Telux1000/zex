import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';

/**
 * Outstanding balance for Assistant chat cards — uses {@link resolveInvoiceBalanceDue} (same as email/PDF/table).
 * Do not trust persisted `invoices.balance_due` alone.
 */
export function deriveAssistantChatBalanceDue(input: {
  total: number | null | undefined;
  amount_paid: number | null | undefined;
  appliedCredits?: number | null | undefined;
  status?: string | null | undefined;
}): number | null {
  if (input.total == null || !Number.isFinite(Number(input.total))) return null;
  return resolveInvoiceBalanceDue({
    status: input.status,
    total: Number(input.total),
    amount_paid: input.amount_paid,
    appliedCredits: input.appliedCredits,
  });
}
