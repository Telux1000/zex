'use client';

import { useEffect, useRef } from 'react';
import { ForcePublicDocumentLight } from '@/components/public/ForcePublicDocumentLight';
import {
  InvoicePrintDocument,
  type InvoicePrintDocumentData,
} from '@/components/invoices/InvoicePrintDocument';

const READY_ATTR = 'data-pdf-invoice-ready' as const;

/**
 * Isolated print shell for headless PDF: matches `.invoice-print-container` print CSS
 * and signals readiness when the client has mounted the document.
 */
export function InvoicePdfPrintClient({ data }: { data: InvoicePrintDocumentData }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.setAttribute(READY_ATTR, '1');
  }, []);

  return (
    <div ref={rootRef} className="invoice-print-container min-h-screen bg-white p-4">
      <ForcePublicDocumentLight />
      {/** Match dashboard saved preview: quote link allowed for internal PDF */}
      <InvoicePrintDocument data={data} showSourceQuoteLink />
    </div>
  );
}
