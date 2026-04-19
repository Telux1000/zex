import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'overdue'
  | 'partially_paid'
  | 'paid'
  | 'voided'
  | string;

type InvoiceStatusInput = {
  status?: string | null;
  total?: number | null;
  amount_paid?: number | null;
  balance_due?: number | null;
  total_refunded?: number | null;
};

export function deriveInvoiceStatus(input: InvoiceStatusInput): InvoiceStatus {
  const current = String(input.status ?? '').toLowerCase();
  if (current === 'voided' || current === 'cancelled') return current;

  const total = Number(input.total ?? 0);
  const amountPaid = Math.max(0, Number(input.amount_paid ?? 0));
  const totalRefunded = Math.max(0, Number(input.total_refunded ?? 0));
  /** Always derive from totals + refunds so stale `balance_due` cannot keep refunded rows “open”. */
  const balanceDue = resolveInvoiceBalanceDue({
    status: current,
    total,
    amount_paid: amountPaid,
    total_refunded: totalRefunded,
  });
  const netRetained = Math.max(0, amountPaid - totalRefunded);
  const fullyRefunded = totalRefunded > 0.0001 && totalRefunded >= amountPaid;

  if (fullyRefunded) return 'refunded';
  if (balanceDue <= 0.0001 && netRetained > 0.0001) return 'paid';
  if (netRetained > 0.0001 && balanceDue > 0.0001) {
    return totalRefunded > 0.0001 ? 'partially_refunded' : 'partially_paid';
  }

  return (current || 'draft') as InvoiceStatus;
}

