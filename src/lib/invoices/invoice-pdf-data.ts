import type { SupabaseClient } from '@supabase/supabase-js';
import { buildInvoiceDocumentPayload } from '@/lib/invoices/invoice-document-payload';
import { getInvoiceRendererDataForOwnerPdf } from '@/lib/invoices/get-invoice-renderer-data-for-owner-pdf';
import { createInvoicePdfRenderToken } from '@/lib/invoices/invoice-pdf-token';
import { renderUrlToInvoicePdfBuffer } from '@/lib/invoices/invoice-pdf-headless';
import { buildInvoicePdfBase64 } from '@/services/invoice-pdf';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';
import { normalizeInvoiceTemplateId, type InvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';

export type InvoicePdfBuildRenderer = 'puppeteer-shared' | 'pdf-lib-legacy';

export type BuildInvoicePdfForIdResult = {
  base64: string;
  invoiceNumber: string;
  templateId: InvoiceTemplateId;
  renderer: InvoicePdfBuildRenderer;
};

/**
 * Produces a PDF: by default the same `InvoiceRenderer` as print (headless Chrome
 * loads `/print/invoice-pdf`). Set `INVOICE_PDF_ENGINE=pdflib` to use the older
 * pdf-lib generator (no style parity with print).
 */
export async function buildInvoicePdfBase64ForInvoiceId(
  supabase: SupabaseClient,
  options: { invoiceId: string; ownerUserId: string; paymentUrl?: string | null; requestOrigin?: string }
): Promise<BuildInvoicePdfForIdResult> {
  const { invoiceId, ownerUserId, paymentUrl, requestOrigin } = options;

  const { data, invoiceNumber, templateId } = await getInvoiceRendererDataForOwnerPdf(supabase, {
    invoiceId,
    ownerUserId,
  });

  if (String(process.env.INVOICE_PDF_ENGINE ?? '').trim() === 'pdflib') {
    return buildPdfLibResult(data, invoiceNumber, templateId, paymentUrl);
  }

  const token = createInvoicePdfRenderToken({ invoiceId, userId: ownerUserId });
  const base = String(resolveAppBaseUrl(requestOrigin) ?? '').trim() || 'http://127.0.0.1:3000';
  const u = new URL('/print/invoice-pdf', base);
  u.searchParams.set('t', token);
  const url = u.toString();
  try {
    const buf = await renderUrlToInvoicePdfBuffer(url);
    return { base64: buf.toString('base64'), invoiceNumber, templateId, renderer: 'puppeteer-shared' };
  } catch (e) {
    console.error('[invoice-pdf] headless render failed, falling back to pdf-lib', e);
    return buildPdfLibResult(data, invoiceNumber, templateId, paymentUrl);
  }
}

async function buildPdfLibResult(
  data: Awaited<ReturnType<typeof getInvoiceRendererDataForOwnerPdf>>['data'],
  invoiceNumber: string,
  templateId: InvoiceTemplateId,
  paymentUrl: string | null | undefined
): Promise<BuildInvoicePdfForIdResult> {
  const doc = buildInvoiceDocumentPayload({
    business: data.business,
    invoice: data.invoice,
    items: data.items,
  });
  const base64 = await buildInvoicePdfBase64(
    doc,
    paymentUrl ?? null,
    normalizeInvoiceTemplateId(templateId)
  );
  return { base64, invoiceNumber, templateId, renderer: 'pdf-lib-legacy' };
}
