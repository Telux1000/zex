'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ManualInvoiceForm from '@/components/invoices/ManualInvoiceForm';
import { InvoiceCreationHub } from '@/components/invoices/InvoiceCreationHub';
import { useInvoiceCreationWorkspace } from '@/hooks/use-invoice-creation-workspace';

function NewInvoicePageContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
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
