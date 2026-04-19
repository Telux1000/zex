'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Circle } from 'lucide-react';
import { sanitizeReturnToPath } from '@/lib/navigation/safe-return-to';
import { cn } from '@/lib/utils/cn';

type InvoiceCustomerSetupPanelProps = {
  /** When true, show a secondary control to go back to the invoice hub. */
  invoiceFlow?: boolean;
  /** Override return path after adding a customer (defaults to current path + query). */
  returnTo?: string;
  className?: string;
};

/**
 * Single setup state when core workspace setup is done but there is no customer yet.
 * Keeps copy non-repetitive and routes to customer creation with a safe return URL.
 */
export function InvoiceCustomerSetupPanel({
  invoiceFlow = false,
  returnTo: returnToProp,
  className,
}: InvoiceCustomerSetupPanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const computedReturn =
    pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
  const safe = sanitizeReturnToPath(returnToProp ?? computedReturn) ?? '/dashboard/invoices/new';
  const addCustomerHref = `/dashboard/customers?add=1&return_to=${encodeURIComponent(safe)}`;

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-lg rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-6 text-[var(--foreground)] shadow-sm',
        className
      )}
      role="status"
    >
      <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
        Finish setup to create invoices
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        To create your first invoice, add a customer first.
      </p>

      <div className="mt-5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-700/80 dark:bg-slate-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Setup invoicing
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <Circle className="mt-0.5 h-4 w-4 shrink-0 fill-indigo-600 text-indigo-600 dark:fill-indigo-400 dark:text-indigo-400" aria-hidden />
            <span className="font-medium text-slate-900 dark:text-slate-100">Add customer</span>
          </li>
          <li className="flex items-start gap-2 text-slate-500 dark:text-slate-500">
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
            <span>Create first invoice</span>
            <span className="sr-only">Unavailable until you add a customer.</span>
          </li>
        </ul>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Link
          href={addCustomerHref}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Add customer
        </Link>
        {invoiceFlow ? (
          <Link
            href="/dashboard/invoices/new"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back
          </Link>
        ) : null}
      </div>
    </div>
  );
}
