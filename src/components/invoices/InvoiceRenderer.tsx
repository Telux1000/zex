'use client';

import { useMemo } from 'react';
import { buildInvoiceDocumentPayload } from '@/lib/invoices/invoice-document-payload';
import {
  type InvoiceTemplateId,
  normalizeInvoiceTemplateId,
} from '@/lib/invoices/invoice-template-ids';
import type { SavedBusiness, SavedInvoice, SavedInvoiceItem } from '@/types/invoice-preview';
import { InvoiceDocumentView } from './InvoiceDocumentView';

export type InvoiceRendererData = {
  business: SavedBusiness;
  invoice: SavedInvoice;
  items: SavedInvoiceItem[];
};

export type InvoiceRendererProps = {
  data: InvoiceRendererData;
  /** When set, overrides `invoice.template_id` (e.g. live form preview before save). */
  templateId?: InvoiceTemplateId;
  /** When true, the “From quote” value links to the dashboard. Public/customer view should set false. */
  showSourceQuoteLink?: boolean;
};

export function InvoiceRenderer({ data, templateId, showSourceQuoteLink = true }: InvoiceRendererProps) {
  const doc = useMemo(() => buildInvoiceDocumentPayload(data), [data]);
  const resolved: InvoiceTemplateId = templateId ?? normalizeInvoiceTemplateId((data.invoice as { template_id?: string | null }).template_id);

  return (
    <div
      className="print-invoice-doc mx-auto w-full min-w-0 max-w-full overflow-x-hidden p-0"
      data-invoice-template={resolved}
    >
      <InvoiceDocumentView
        doc={doc}
        invoice={data.invoice}
        templateId={resolved}
        showSourceQuoteLink={showSourceQuoteLink}
      />
    </div>
  );
}
