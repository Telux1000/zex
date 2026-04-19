'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sanitizeReturnToPath } from '@/lib/navigation/safe-return-to';

type Variant = 'invoice' | 'quote';

const body: Record<Variant, string> = {
  invoice: "You'll need a customer to create an invoice. Add one now or continue.",
  quote: "You'll need a customer to create a quote. Add one now or continue.",
};

/**
 * Dismissible contextual prompt when the workspace has no customers yet.
 * Does not block the page; finalize/save still enforces a customer elsewhere.
 */
export function CustomerNeededSoftPrompt({
  variant,
  returnTo,
}: {
  variant: Variant;
  returnTo: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const safe = sanitizeReturnToPath(returnTo) ?? '/dashboard';
  const href = `/dashboard/customers?add=1&return_to=${encodeURIComponent(safe)}`;

  return (
    <div
      className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      role="status"
    >
      <p className="min-w-0 leading-relaxed">{body[variant]}</p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400"
        >
          Add customer
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex items-center justify-center rounded-lg border border-amber-300/80 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100/80 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/70"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
