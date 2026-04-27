import {
  buildPublicCustomerSnapshotFromInvoiceRow,
  formatPublicInvoiceBillToLines,
} from '@/lib/invoices/invoice-public-customer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

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
    <div className="min-w-0 max-w-full">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Bill to
      </p>
      <div className="mt-1 min-w-0 space-y-0.5">
        {displayLines.map((line, i) => {
          const isEmail = EMAIL_RE.test(line);
          return (
            <p
              key={i}
              className={
                i === 0
                  ? 'min-w-0 break-words font-semibold [overflow-wrap:anywhere] text-slate-900'
                  : 'min-w-0 break-words text-sm [overflow-wrap:anywhere] text-slate-600'
              }
            >
              {isEmail ? (
                <a href={`mailto:${encodeURIComponent(line)}`} className="text-slate-600 hover:underline">
                  {line}
                </a>
              ) : (
                line
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}
