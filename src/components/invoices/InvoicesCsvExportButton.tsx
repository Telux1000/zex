'use client';

import { FileDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useInvoiceListCsvExport } from '@/components/invoices/use-invoice-list-csv-export';

type Props = {
  businessId: string;
};

/**
 * CSV export for the invoice list — same filters/sort as the table (from URL).
 * Styled to align with Recurring / Create invoice in the page header.
 */
export function InvoicesCsvExportButton({ businessId }: Props) {
  const { exportInvoicesCsv, exportingCsv, exportLongWait } = useInvoiceListCsvExport(businessId);

  const busyLabel = exportingCsv
    ? exportLongWait
      ? 'Preparing CSV…'
      : 'Exporting…'
    : null;

  return (
    <button
      type="button"
      onClick={exportInvoicesCsv}
      disabled={exportingCsv}
      className={cn(
        'inline-flex min-h-10 touch-manipulation items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition-colors',
        exportingCsv
          ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
      )}
      aria-label={exportingCsv ? 'Exporting invoice list' : 'Export invoice list as CSV'}
      aria-busy={exportingCsv}
    >
      <FileDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
      {exportingCsv && busyLabel ? (
        <span className="min-w-0">{busyLabel}</span>
      ) : (
        <>
          <span className="sm:hidden">CSV</span>
          <span className="hidden sm:inline">Export CSV</span>
        </>
      )}
    </button>
  );
}
