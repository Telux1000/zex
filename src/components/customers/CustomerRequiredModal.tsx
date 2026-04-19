'use client';

import Link from 'next/link';
import { sanitizeReturnToPath } from '@/lib/navigation/safe-return-to';

type Variant = 'invoice' | 'quote';

const copy: Record<Variant, { title: string; body: string }> = {
  invoice: {
    title: 'Customer required',
    body: 'Add or select a customer before you can save this invoice.',
  },
  quote: {
    title: 'Customer required',
    body: 'Add or select a customer before you can save this quote.',
  },
};

/**
 * Shown when saving/finalizing an invoice or quote without a customer.
 * Primary action opens the customer form with return_to for resume.
 */
export function CustomerRequiredModal({
  open,
  onClose,
  returnTo,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  /** Path to return to after saving a customer (e.g. /dashboard/invoices/new). */
  returnTo: string;
  variant: Variant;
}) {
  const safe = sanitizeReturnToPath(returnTo) ?? '/dashboard';
  const href = `/dashboard/customers?add=1&return_to=${encodeURIComponent(safe)}`;
  const { title, body } = copy[variant];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-required-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
        <h2 id="customer-required-title" className="text-lg font-semibold text-[var(--foreground)]">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={href}
            className="inline-flex flex-1 min-w-[8rem] items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            onClick={onClose}
          >
            Add customer
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
