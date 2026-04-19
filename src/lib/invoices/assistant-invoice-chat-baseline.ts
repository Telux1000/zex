import type { InvoiceAssistantChatCard } from '@/lib/invoices/conversational-invoice-wizard/types';
import type { AssistantInvoiceChatOverlay } from '@/lib/invoices/assistant-invoice-chat-overlay';

/** Comparable fields for “did this invoice change vs what the chat card first showed?” */
export type InvoiceValueSnapshot = {
  invoice_number: string | null;
  customer_name: string | null;
  total: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  currency: string | null;
  status: string | null;
  due_date: string | null;
};

function normStr(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function normNum(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function snapshotKey(s: InvoiceValueSnapshot): string {
  return JSON.stringify({
    invoice_number: normStr(s.invoice_number),
    customer_name: normStr(s.customer_name),
    total: normNum(s.total),
    amount_paid: normNum(s.amount_paid),
    balance_due: normNum(s.balance_due),
    currency: (s.currency ?? '').trim().toUpperCase(),
    status: normStr(s.status),
    due_date: (s.due_date ?? '').trim(),
  });
}

export function snapshotsEqual(a: InvoiceValueSnapshot, b: InvoiceValueSnapshot): boolean {
  return snapshotKey(a) === snapshotKey(b);
}

/** Build snapshot from overlay fields (after a save), excluding edited timestamp. */
export function snapshotFromOverlayFields(
  fields: Omit<AssistantInvoiceChatOverlay, 'editedAtMs'>
): InvoiceValueSnapshot {
  return {
    invoice_number: fields.invoice_number ?? null,
    customer_name: fields.customer_name ?? null,
    total: fields.total ?? null,
    amount_paid: fields.amount_paid ?? null,
    balance_due: fields.balance_due ?? null,
    currency: fields.currency ?? null,
    status: fields.status ?? null,
    due_date: fields.due_date ?? null,
  };
}

/** Extract per-invoice snapshots from one structured chat card (message attachment). */
export function iterSnapshotsFromCard(
  card: InvoiceAssistantChatCard
): Array<{ invoiceId: string; snapshot: InvoiceValueSnapshot }> {
  switch (card.card_type) {
    case 'invoice_created_success':
    case 'invoice_sent_success':
    case 'invoice_payment_success':
      return [
        {
          invoiceId: card.invoice_id,
          snapshot: {
            invoice_number: card.invoice_number,
            customer_name: card.customer_name,
            total: null,
            amount_paid: null,
            balance_due: null,
            currency: card.card_type === 'invoice_payment_success' ? card.currency : null,
            status: card.card_type === 'invoice_payment_success' ? card.status : null,
            due_date: null,
          },
        },
      ];
    case 'invoice_single':
      return [
        {
          invoiceId: card.invoice_id,
          snapshot: {
            invoice_number: card.invoice_number,
            customer_name: card.customer_name,
            total: card.total,
            amount_paid: null,
            balance_due: null,
            currency: card.currency,
            status: card.status,
            due_date: null,
          },
        },
      ];
    case 'invoice_pick':
      return card.options.map((opt) => ({
        invoiceId: opt.invoice_id,
        snapshot: {
          invoice_number: opt.invoice_number,
          customer_name: opt.customer_name,
          total: opt.total,
          amount_paid: null,
          balance_due: null,
          currency: opt.currency,
          status: opt.status,
          due_date: null,
        },
      }));
    case 'invoice_list':
      return card.items.map((item) => ({
        invoiceId: item.invoice_id,
        snapshot: {
          invoice_number: item.invoice_number,
          customer_name: item.customer_name,
          total: item.total,
          amount_paid: null,
          balance_due: null,
          currency: item.currency,
          status: item.status,
          due_date: null,
        },
      }));
    default:
      return [];
  }
}
