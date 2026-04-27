'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ManualInvoiceFormCreateShell } from '@/components/invoices/ManualInvoiceFormCreateShell';
import { devEnsureManualInvoiceOpenClickT0, devLogManualInvoiceOpen } from '@/lib/dev/manual-invoice-open-timing';
import { InvoiceCreationHub } from '@/components/invoices/InvoiceCreationHub';
import { useInvoiceCreationWorkspace } from '@/hooks/use-invoice-creation-workspace';

const ManualInvoiceForm = dynamic(
  () => import('@/components/invoices/ManualInvoiceForm'),
  { loading: () => <ManualInvoiceFormCreateShell /> }
);

function NewInvoicePageContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
  useEffect(() => {
    if (mode === 'form') {
      devEnsureManualInvoiceOpenClickT0();
      devLogManualInvoiceOpen('new_invoice_page_mode_form_mount', {});
    }
  }, [mode]);
  const workspace = useInvoiceCreationWorkspace();

  if (mode === 'form') {
    const customerId = searchParams.get('customer_id');
    return <ManualInvoiceForm initialCustomerId={customerId ?? undefined} mode="create" />;
  }

  return <InvoiceCreationHub workspace={workspace} />;
}

export default function NewInvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-4xl justify-center py-16 text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <NewInvoicePageContent />
    </Suspense>
  );
}
