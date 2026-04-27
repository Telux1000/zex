'use client';

import { InvoiceRenderer, type InvoiceRendererData } from '@/components/invoices/InvoiceRenderer';

/**
 * Customer-facing / token invoice document. Same `InvoiceRenderer` as dashboard, without dashboard-only links.
 */
export function PublicInvoiceDocumentClient({ data }: { data: InvoiceRendererData }) {
  return <InvoiceRenderer data={data} showSourceQuoteLink={false} />;
}
