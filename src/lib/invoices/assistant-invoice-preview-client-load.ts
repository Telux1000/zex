import { createClient } from '@/lib/supabase/client';
import type { EditModeInitialData } from '@/components/invoices/ManualInvoiceForm';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { mapApiInvoiceJsonToEditModeInitialData } from '@/lib/invoices/map-api-invoice-to-edit-initial-data';
import {
  mapApiInvoiceJsonToPreviewSaved,
  type InvoicePreviewSavedBundle,
} from '@/lib/invoices/map-api-invoice-to-preview-saved';

/** Preview mapping does not use themes; embedding `invoice_themes(*)` can fail the whole PostgREST row if RLS differs. */
const INVOICE_PREVIEW_SELECT =
  '*, invoice_items(*), invoice_payment_schedule_items(*), businesses(*)';

function invoiceRowToPreviewBundle(data: Record<string, unknown>): InvoicePreviewSavedBundle | null {
  const total = Number(data.total ?? 0);
  const amountPaid = Number(data.amount_paid ?? 0);
  const totalRefunded = Number(data.total_refunded ?? 0);
  const balanceDue = resolveInvoiceBalanceDue({
    status: String(data.status ?? ''),
    total,
    amount_paid: amountPaid,
    total_refunded: totalRefunded,
  });

  const payload: Record<string, unknown> = {
    ...data,
    status: deriveInvoiceStatus({
      status: data.status as string | null | undefined,
      total,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      total_refunded: totalRefunded,
    }),
  };

  return mapApiInvoiceJsonToPreviewSaved(payload);
}

async function loadAssistantInvoicePreviewFromApi(
  invoiceId: string
): Promise<
  | { ok: true; bundle: InvoicePreviewSavedBundle; editInitialData: EditModeInitialData | null }
  | { ok: false }
> {
  const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!res.ok) return { ok: false };
  const json = (await res.json()) as Record<string, unknown>;
  const bundle = mapApiInvoiceJsonToPreviewSaved(json);
  if (!bundle) return { ok: false };
  const editInitialData = mapApiInvoiceJsonToEditModeInitialData(json);
  return { ok: true, bundle, editInitialData };
}

/**
 * Load invoice data for the Assistant preview modal using the **browser** Supabase client,
 * with **GET /api/invoices/[id]** as fallback (same JSON shape). Handles:
 * - Session not hydrated yet on first paint (`getSession` + `refreshSession` before querying)
 * - PostgREST embed edge cases (narrow select without `invoice_themes`)
 * - Cookie-backed API session when the JS client session is temporarily empty
 */
export async function loadAssistantInvoicePreviewFromSupabase(
  invoiceId: string
): Promise<
  | { ok: true; bundle: InvoicePreviewSavedBundle; editInitialData: EditModeInitialData | null }
  | { ok: false }
> {
  const id = invoiceId.trim();
  if (!id) return { ok: false };

  const supabase = createClient();

  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    await supabase.auth.refreshSession();
    ({ data: { session } } = await supabase.auth.getSession());
  }

  if (session?.user) {
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_PREVIEW_SELECT)
      .eq('id', id)
      .single();

    if (!error && data) {
      const raw = data as Record<string, unknown>;
      const bundle = invoiceRowToPreviewBundle(raw);
      if (bundle) {
        const editInitialData = mapApiInvoiceJsonToEditModeInitialData(raw);
        return { ok: true, bundle, editInitialData };
      }
    }
  }

  return loadAssistantInvoicePreviewFromApi(id);
}
