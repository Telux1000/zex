'use client';

import type { EditModeInitialData } from './ManualInvoiceForm';
import ManualInvoiceForm from './ManualInvoiceForm';

type Props = {
  invoiceId: string;
  initialData: EditModeInitialData;
  invoiceNumber?: string | null;
};

export function InvoiceEditForm({ invoiceId, initialData, invoiceNumber }: Props) {
  return (
    <div className="mt-6">
      <ManualInvoiceForm
        invoiceId={invoiceId}
        initialData={initialData}
        mode="edit"
        editInvoiceNumber={invoiceNumber ?? null}
      />
    </div>
  );
}
