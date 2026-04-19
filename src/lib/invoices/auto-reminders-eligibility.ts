import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';

/** Server payload for auto-reminder modal initial state (invoice + customer defaults). */
export type AutoRemindersInitialPayload = {
  useCustomerReminderDefaults: boolean;
  reminderSettings: unknown;
  customerReminderSettings: unknown | null;
};

/** Invoice-shaped input for eligibility (DB or derived fields). */
export type AutoRemindersInvoiceInput = {
  status: string | null | undefined;
  total?: number | null;
  amount_paid?: number | null;
  balance_due?: number | null;
};

/**
 * Whether auto-reminder settings may be managed (UI + API).
 * Sent lifecycle + open balance; excludes draft, paid, cancelled/voided.
 */
export function canManageAutoReminders(inv: AutoRemindersInvoiceInput): boolean {
  const balanceDue = resolveInvoiceBalanceDue({
    status: inv.status,
    total: inv.total,
    amount_paid: inv.amount_paid,
  });
  const derived = deriveInvoiceStatus({
    status: inv.status,
    total: inv.total,
    amount_paid: inv.amount_paid,
    balance_due: balanceDue,
  });
  const st = String(derived).toLowerCase();
  if (st === 'draft' || st === 'paid' || st === 'voided' || st === 'cancelled') return false;
  if (!['sent', 'viewed', 'overdue', 'partially_paid'].includes(st)) return false;

  return balanceDue > 0.005;
}
