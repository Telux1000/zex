import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getInvoiceRendererDataForOwnerPdf } from '@/lib/invoices/get-invoice-renderer-data-for-owner-pdf';
import { verifyInvoicePdfRenderToken } from '@/lib/invoices/invoice-pdf-token';
import { InvoicePdfPrintClient } from './InvoicePdfPrintClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Invoice PDF',
};

export const dynamic = 'force-dynamic';

export default async function InvoicePrintPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const verified = verifyInvoicePdfRenderToken(t);
  if (!verified) {
    notFound();
  }
  const supabase = await createServiceClient();
  let bundle;
  try {
    bundle = await getInvoiceRendererDataForOwnerPdf(supabase, {
      invoiceId: verified.invoiceId,
      ownerUserId: verified.userId,
    });
  } catch {
    notFound();
  }
  return <InvoicePdfPrintClient data={bundle.data} />;
}
