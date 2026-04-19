'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Non-blocking reminder when the workspace has no business street address yet.
 * Invoices can still be created; PDFs and emails may omit sender address until added in Settings.
 */
export function BusinessAddressInvoiceSoftPrompt() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className="mb-5 flex flex-col gap-3 rounded-xl border border-sky-200/90 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 dark:border-sky-800/50 dark:bg-sky-950/35 dark:text-sky-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      role="status"
    >
      <p className="min-w-0 leading-relaxed">Add your business address to appear on invoices</p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link
          href="/settings?section=business-profile"
          className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400"
        >
          Add address
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex items-center justify-center rounded-lg border border-sky-300/80 bg-white px-3 py-2 text-xs font-medium text-sky-950 hover:bg-sky-100/80 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/70"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
