'use client';

import { InvoiceRenderer } from '@/components/invoices/InvoiceRenderer';
import type { SavedBusiness, SavedInvoice, SavedInvoiceItem } from '@/types/invoice-preview';
export type {
  SavedBusiness,
  SavedInvoiceMetadata,
  SavedInvoice,
  SavedInvoiceItem,
} from '@/types/invoice-preview';

type InvoicePreviewSavedProps = {
  source: 'saved';
  data: {
    business: SavedBusiness;
    invoice: SavedInvoice;
    items: SavedInvoiceItem[];
  };
};

/** Read-only saved invoice document (same renderer as public + live editor). */
export function InvoicePreviewSaved({ data }: InvoicePreviewSavedProps) {
  return <InvoiceRenderer data={data} showSourceQuoteLink />;
}
