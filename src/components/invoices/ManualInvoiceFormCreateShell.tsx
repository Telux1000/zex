'use client';

import { useEffect } from 'react';
import { devLogManualInvoiceOpen, manualInvoiceOpenTimingEnabled } from '@/lib/dev/manual-invoice-open-timing';

/**
 * Minimal placeholder for `next/dynamic` while the full manual form chunk loads.
 * Kept small so the route shell stays fast to parse and paint.
 */
export function ManualInvoiceFormCreateShell() {
  useEffect(() => {
    if (manualInvoiceOpenTimingEnabled()) {
      devLogManualInvoiceOpen('manual_form_dynamic_import_loading_ui', {});
    }
  }, []);
  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-0"
      aria-busy
      aria-label="Loading manual invoice"
    >
      <div className="space-y-2 border-b border-slate-200/80 pb-5 dark:border-slate-800/90 sm:pb-6">
        <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-7 w-48 max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-64 max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="h-10 w-full max-w-md animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
      <div className="h-32 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/80" />
      <p className="text-sm text-slate-500 dark:text-slate-400">Loading form…</p>
    </div>
  );
}
