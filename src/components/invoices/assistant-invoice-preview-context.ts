/**
 * Handoff from Assistant chat cards → preview modal: same internal invoice id the server used
 * when building the card, plus optional display fields for immediate UI + fallback if fetch fails.
 */
export type AssistantInvoicePreviewContext = {
  /** Canonical `invoices.id` (UUID) — matches GET /api/invoices/[id]. */
  invoiceId: string;
  invoice_number?: string | null;
  customer_name?: string | null;
  total?: number | null;
  /** Outstanding balance when known (e.g. rehydrated from invoice row). */
  balance_due?: number | null;
  currency?: string | null;
  status?: string | null;
  /** Open Assistant invoice workspace in edit mode after load (e.g. chat “Edit invoice”). */
  initialMode?: 'view' | 'edit';
};
