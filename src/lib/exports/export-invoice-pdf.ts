import type { SupabaseClient } from '@supabase/supabase-js';
import type { BuildInvoicePdfForIdResult } from '@/lib/invoices/invoice-pdf-data';

/**
 * Server-side PDF export. Dynamically loads the headless + PDF pipeline so route modules
 * stay small; behavior matches `GET /api/invoices/:id/pdf` and print.
 */
export async function exportOwnerInvoiceToPdf(
  supabase: SupabaseClient,
  input: {
    invoiceId: string;
    ownerUserId: string;
    requestOrigin: string;
    /** Optional hosted payment link line on legacy pdf-lib path. */
    paymentUrl?: string | null;
  }
): Promise<BuildInvoicePdfForIdResult> {
  const { buildInvoicePdfBase64ForInvoiceId } = await import('@/lib/invoices/invoice-pdf-data');
  return buildInvoicePdfBase64ForInvoiceId(supabase, {
    invoiceId: input.invoiceId,
    ownerUserId: input.ownerUserId,
    paymentUrl: input.paymentUrl ?? null,
    requestOrigin: input.requestOrigin,
  });
}
