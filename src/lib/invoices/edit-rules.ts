import type { InvoiceStatus } from '@/lib/database.types';

/**
 * Status workflow: Draft → Sent → Partially Paid → Paid | Voided
 * Edit rules for accounting integrity.
 */

/** Fully editable: all fields including line items, totals, dates */
export function canEditFully(status: InvoiceStatus | string): boolean {
  return status === 'draft' || status === 'sent' || status === 'pending';
}

/** Restricted edit: only notes, reference, terms (no financial/line item changes) */
export function canEditRestricted(status: InvoiceStatus | string): boolean {
  const s = String(status).toLowerCase();
  return s === 'partially_paid' || s === 'partially_refunded';
}

/** Any edit allowed (full or restricted) */
export function canEdit(status: InvoiceStatus | string): boolean {
  return canEditFully(status) || canEditRestricted(status);
}

/**
 * Payment schedule rows may be updated while the invoice has an open balance,
 * including when line items / totals are restricted (e.g. partially paid).
 */
export function canEditPaymentSchedule(status: InvoiceStatus | string): boolean {
  const s = String(status).toLowerCase();
  if (isLocked(s)) return false;
  return canEditFully(s) || s === 'partially_paid' || s === 'partially_refunded';
}

/** Invoice is locked: no editing (paid or voided) */
export function isLocked(status: InvoiceStatus | string): boolean {
  return status === 'paid' || status === 'voided';
}

/** Can void the invoice (set status to voided) */
export function canVoid(status: InvoiceStatus | string): boolean {
  const s = String(status).toLowerCase();
  return ['draft', 'sent', 'pending', 'viewed', 'partially_paid', 'partially_refunded', 'paid', 'overdue'].includes(s);
}

/** Can delete (hard delete) - typically draft only */
export function canDelete(status: InvoiceStatus | string): boolean {
  return status === 'draft';
}

/**
 * When true, the app may expose credit-note UI (e.g. invoice preview menu).
 * Keep false until the credit note flow is implemented end-to-end.
 */
export const INVOICE_CREDIT_NOTE_UI_ENABLED = false as const;

/** Display label for status */
export function statusLabel(status: InvoiceStatus | string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending',
    sent: 'Sent',
    viewed: 'Viewed',
    partially_paid: 'Partially Paid',
    paid: 'Paid',
    overdue: 'Overdue',
    refunded: 'Refunded',
    partially_refunded: 'Partially refunded',
    cancelled: 'Cancelled',
    voided: 'Voided',
  };
  return labels[status] ?? status;
}

/**
 * Pill / badge Tailwind classes for invoice status (assistant chat, inline with invoices table semantics).
 * Sent = indigo; Viewed and partially paid = amber; Paid = violet, etc.
 */
export function invoiceStatusBadgeClassName(status: InvoiceStatus | string | null | undefined): string {
  const s = String(status ?? 'draft')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  const sentLike = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200';
  const amberLike = 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    pending: sentLike,
    sent: sentLike,
    viewed: amberLike,
    partially_paid: amberLike,
    paid: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200',
    refunded: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
    partially_refunded: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    cancelled: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
    voided: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
  };
  return map[s] ?? map.draft!;
}
