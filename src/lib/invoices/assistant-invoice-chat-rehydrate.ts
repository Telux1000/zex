import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceAssistantChatCard } from '@/lib/invoices/conversational-invoice-wizard/types';
import type { AssistantInvoiceChatOverlay } from '@/lib/invoices/assistant-invoice-chat-overlay';
import { deriveAssistantChatBalanceDue } from '@/lib/invoices/assistant-chat-balance-due';
import { assistantInvoiceDisplayAmountsFromRow } from '@/lib/invoices/assistant-invoice-queries';

/** Canonical invoice row for Assistant chat cards (browser Supabase or API). */
export type AssistantInvoiceRehydrateRow = {
  invoice_number: string | null;
  customer_name: string | null;
  total: number | null;
  amount_paid: number | null;
  /** Always derived via {@link deriveAssistantChatBalanceDue}; not read from DB column alone. */
  balance_due: number | null;
  currency: string | null;
  status: string | null;
  due_date: string | null;
  paid_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export type ChatMessageWithCards = {
  role: string;
  createdAt?: number;
  cards?: InvoiceAssistantChatCard[];
};

function collectIdsFromCard(card: InvoiceAssistantChatCard): string[] {
  switch (card.card_type) {
    case 'invoice_created_success':
    case 'invoice_sent_success':
    case 'invoice_payment_success':
      return [card.invoice_id];
    case 'invoice_single':
      return [card.invoice_id];
    case 'invoice_pick':
      return card.options.map((o) => o.invoice_id);
    case 'invoice_list':
      return card.items.map((i) => i.invoice_id);
    default:
      return [];
  }
}

export function collectInvoiceIdsFromMessages(messages: ChatMessageWithCards[]): string[] {
  const set = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.cards?.length) continue;
    for (const card of msg.cards) {
      for (const id of collectIdsFromCard(card)) {
        if (id.trim()) set.add(id.trim());
      }
    }
  }
  return Array.from(set);
}

/** Earliest assistant message time that referenced an invoice (anchor for “edited after card”). */
export function invoiceAnchorMsByIdFromMessages(messages: ChatMessageWithCards[]): Record<string, number> {
  const anchors: Record<string, number> = {};
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.cards?.length) continue;
    const t = msg.createdAt ?? 0;
    for (const card of msg.cards) {
      for (const id of collectIdsFromCard(card)) {
        const key = id.trim();
        if (!key) continue;
        if (anchors[key] === undefined) anchors[key] = t;
        else anchors[key] = Math.min(anchors[key]!, t);
      }
    }
  }
  return anchors;
}

const CHUNK = 100;

export async function fetchAssistantInvoiceRowsForChat(
  supabase: SupabaseClient,
  businessId: string,
  ids: string[]
): Promise<Record<string, AssistantInvoiceRehydrateRow>> {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length === 0) return {};

  const out: Record<string, AssistantInvoiceRehydrateRow> = {};

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, customer_name, total, currency, status, due_date, paid_at, amount_paid, balance_due, updated_at, created_at'
      )
      .eq('business_id', businessId)
      .in('id', chunk);

    if (error || !data) continue;

    for (const row of data as Record<string, unknown>[]) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const total = row.total != null ? Number(row.total) : null;
      const statusStr = row.status != null ? String(row.status) : null;
      const { amount_paid: resolvedPaid, balance_due: resolvedBalance } =
        assistantInvoiceDisplayAmountsFromRow(row);
      const amountPaid =
        resolvedPaid != null && Number.isFinite(resolvedPaid)
          ? resolvedPaid
          : row.amount_paid != null
            ? Number(row.amount_paid)
            : 0;
      const balanceDue =
        resolvedBalance != null && Number.isFinite(resolvedBalance)
          ? resolvedBalance
          : deriveAssistantChatBalanceDue({
              total,
              amount_paid: amountPaid,
              status: statusStr,
            });

      out[id] = {
        invoice_number:
          row.invoice_number != null && String(row.invoice_number).trim()
            ? String(row.invoice_number).trim()
            : null,
        customer_name:
          row.customer_name != null && String(row.customer_name).trim()
            ? String(row.customer_name).trim()
            : null,
        total,
        amount_paid: amountPaid,
        balance_due: balanceDue,
        currency: row.currency != null ? String(row.currency).trim() : null,
        status: statusStr,
        due_date: row.due_date != null && String(row.due_date).trim() ? String(row.due_date).trim() : null,
        paid_at: row.paid_at != null && String(row.paid_at).trim() ? String(row.paid_at).trim() : null,
        updated_at: row.updated_at != null ? String(row.updated_at) : null,
        created_at: row.created_at != null ? String(row.created_at) : null,
      };
    }
  }

  return out;
}

export type EffectiveInvoiceOverlayParams = {
  rehydrateById: Record<string, AssistantInvoiceRehydrateRow>;
  sessionOverlayById: Record<string, AssistantInvoiceChatOverlay>;
  anchorMsById: Record<string, number>;
  /** ms after card anchor — avoids false “Edited” when message and DB write are nearly simultaneous */
  editedAfterMsBuffer?: number;
};

/**
 * Merge server-fetched invoice rows with in-session overlay (post-save).
 * Session overlay wins per field when present; “Edited” uses session `editedAtMs` or persisted `updated_at` after anchor.
 */
export function buildEffectiveInvoiceCardOverlayById(
  params: EffectiveInvoiceOverlayParams
): Record<string, AssistantInvoiceChatOverlay> {
  const buffer = params.editedAfterMsBuffer ?? 2000;
  const idSet = new Set([
    ...Object.keys(params.rehydrateById),
    ...Object.keys(params.sessionOverlayById),
  ]);
  const out: Record<string, AssistantInvoiceChatOverlay> = {};

  for (const id of Array.from(idSet)) {
    const r = params.rehydrateById[id];
    const sess = params.sessionOverlayById[id];
    const anchor = params.anchorMsById[id];
    const updatedMs = r?.updated_at ? Date.parse(r.updated_at) : NaN;
    const persistedEdited =
      r != null &&
      Number.isFinite(updatedMs) &&
      anchor != null &&
      updatedMs > anchor + buffer;

    const mergedTotal = sess?.total ?? r?.total ?? null;
    const mergedPaidRaw = sess?.amount_paid ?? r?.amount_paid;
    const mergedPaid =
      mergedPaidRaw != null && Number.isFinite(Number(mergedPaidRaw))
        ? Math.max(0, Number(mergedPaidRaw))
        : 0;
    const mergedStatus = sess?.status ?? r?.status ?? null;
    const balanceDue = deriveAssistantChatBalanceDue({
      total: mergedTotal,
      amount_paid: mergedPaid,
      status: mergedStatus,
    });

    out[id] = {
      invoice_number: sess?.invoice_number ?? r?.invoice_number ?? null,
      customer_name: sess?.customer_name ?? r?.customer_name ?? null,
      total: mergedTotal,
      amount_paid: mergedPaid,
      balance_due: balanceDue,
      currency: sess?.currency ?? r?.currency ?? null,
      status: mergedStatus,
      due_date: sess?.due_date ?? r?.due_date ?? null,
      editedAtMs:
        sess?.editedAtMs ?? (persistedEdited ? updatedMs : undefined),
    };
  }

  return out;
}
