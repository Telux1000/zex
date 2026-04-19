import { formatDistanceToNow } from 'date-fns';
import type { InvoicePreviewSavedBundle } from '@/lib/invoices/map-api-invoice-to-preview-saved';
import type { InvoiceAssistantChatCard } from '@/lib/invoices/conversational-invoice-wizard/types';
import { deriveAssistantChatBalanceDue } from '@/lib/invoices/assistant-chat-balance-due';

/** Client-side snapshot after a successful save from Assistant invoice modal — keyed by `invoice_id`. */
export type AssistantInvoiceChatOverlay = {
  invoice_number: string | null;
  customer_name: string | null;
  total: number | null;
  /** Sum of payments applied (for derived balance). */
  amount_paid?: number | null;
  /** Always derived with {@link deriveAssistantChatBalanceDue} from total / amount_paid (not read blindly from DB). */
  balance_due?: number | null;
  currency: string | null;
  status: string | null;
  due_date: string | null;
  /** Present only when saved data differs from the card’s first-render baseline (subtle “Edited” label). */
  editedAtMs?: number;
};

export type AssistantInvoiceSavedToChatPayload = {
  invoiceId: string;
} & AssistantInvoiceChatOverlay;

export function buildAssistantChatOverlayFromBundle(
  bundle: InvoicePreviewSavedBundle,
  editedAtMs: number
): Omit<AssistantInvoiceSavedToChatPayload, 'invoiceId'> {
  const inv = bundle.invoice;
  const total = Number(inv.total);
  const amountPaid = inv.amount_paid != null ? Number(inv.amount_paid) : 0;
  const balanceDue = deriveAssistantChatBalanceDue({
    total,
    amount_paid: amountPaid,
    status: inv.status,
  });
  return {
    invoice_number: inv.invoice_number?.trim() ? inv.invoice_number.trim() : null,
    customer_name: inv.customer_name?.trim() ? inv.customer_name.trim() : null,
    total,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    currency: inv.currency ?? null,
    status: inv.status ?? null,
    due_date: inv.due_date?.trim() ? inv.due_date.trim() : null,
    editedAtMs,
  };
}

/** Subtle caption: "Edited · 2 minutes ago" */
export function formatAssistantEditedCaption(editedAtMs: number): string {
  try {
    const rel = formatDistanceToNow(new Date(editedAtMs), { addSuffix: true });
    return `Edited · ${rel}`;
  } catch {
    return 'Edited';
  }
}

/** Apply overlay to a chat card when `invoice_id` matches (immutable). */
export function mergeInvoiceAssistantChatCard(
  card: InvoiceAssistantChatCard,
  overlayById: Record<string, AssistantInvoiceChatOverlay> | undefined
): InvoiceAssistantChatCard {
  if (!overlayById) return card;

  switch (card.card_type) {
    case 'invoice_created_success': {
      const o = overlayById[card.invoice_id];
      if (!o) return card;
      return {
        ...card,
        invoice_number: o.invoice_number ?? card.invoice_number,
        customer_name: o.customer_name ?? card.customer_name,
      };
    }
    case 'invoice_sent_success': {
      const o = overlayById[card.invoice_id];
      if (!o) return card;
      return {
        ...card,
        invoice_number: o.invoice_number ?? card.invoice_number,
        customer_name: o.customer_name ?? card.customer_name,
      };
    }
    case 'invoice_payment_success': {
      const o = overlayById[card.invoice_id];
      if (!o) return card;
      return {
        ...card,
        invoice_number: o.invoice_number ?? card.invoice_number,
        customer_name: o.customer_name ?? card.customer_name,
        currency: o.currency ?? card.currency,
        status: o.status ?? card.status,
      };
    }
    case 'invoice_single': {
      const o = overlayById[card.invoice_id];
      if (!o) return card;
      return {
        ...card,
        invoice_number: o.invoice_number ?? card.invoice_number,
        customer_name: o.customer_name ?? card.customer_name,
        total: o.total ?? card.total,
        currency: o.currency ?? card.currency,
        status: o.status ?? card.status,
      };
    }
    case 'invoice_pick': {
      return {
        ...card,
        options: card.options.map((opt) => {
          const o = overlayById[opt.invoice_id];
          if (!o) return opt;
          return {
            ...opt,
            invoice_number: o.invoice_number ?? opt.invoice_number,
            customer_name: o.customer_name ?? opt.customer_name,
            total: o.total ?? opt.total,
            currency: o.currency ?? opt.currency,
            status: o.status ?? opt.status,
          };
        }),
      };
    }
    case 'invoice_list': {
      return {
        ...card,
        items: card.items.map((item) => {
          const o = overlayById[item.invoice_id];
          if (!o) return item;
          const overlayPaid =
            o.amount_paid != null && Number.isFinite(Number(o.amount_paid))
              ? Math.max(0, Number(o.amount_paid))
              : undefined;
          return {
            ...item,
            invoice_number: o.invoice_number ?? item.invoice_number,
            customer_name: o.customer_name ?? item.customer_name,
            total: o.total ?? item.total,
            currency: o.currency ?? item.currency,
            status: o.status ?? item.status,
            amount_paid: overlayPaid !== undefined ? overlayPaid : item.amount_paid,
            balance_due: o.balance_due ?? item.balance_due,
          };
        }),
      };
    }
    default:
      return card;
  }
}
