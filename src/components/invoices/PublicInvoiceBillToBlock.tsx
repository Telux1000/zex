import {
  buildPublicCustomerSnapshotFromInvoiceRow,
  formatPublicInvoiceBillToLines,
} from '@/lib/invoices/invoice-public-customer';

type InvoiceLike = {
  customer_name?: string | null;
  customer_email?: string | null;
  metadata?: unknown;
};

export function PublicInvoiceBillToBlock({ invoice }: { invoice: InvoiceLike }) {
  const meta = (invoice.metadata as Record<string, unknown> | null) ?? null;
  const snapshot = buildPublicCustomerSnapshotFromInvoiceRow(invoice);
  const lines = formatPublicInvoiceBillToLines(snapshot, meta);
  const displayLines =
    lines.length > 0 ? lines : [String(invoice.customer_name ?? '').trim()].filter(Boolean);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Bill to
      </p>
      <div className="mt-1 space-y-0.5">
        {displayLines.map((line, i) => (
          <p
            key={i}
            className={
              i === 0
                ? 'font-semibold text-slate-900'
                : 'text-sm text-slate-600'
            }
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
