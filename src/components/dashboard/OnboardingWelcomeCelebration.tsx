'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useHasCustomer } from '@/contexts/DashboardAccessContext';

const WELCOME_QUERY = 'welcome';

/**
 * One-shot celebration after guided onboarding (query `?welcome=1`).
 * Non-blocking fixed toast; no persistent bar. Param is stripped so refresh does not replay.
 */
export function OnboardingWelcomeCelebration() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasCustomer = useHasCustomer();
  const [visible, setVisible] = useState(false);
  const dismissedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setVisible(false);
    router.replace('/dashboard');
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (searchParams.get(WELCOME_QUERY) !== '1') {
      setVisible(false);
      return;
    }
    dismissedRef.current = false;
    setVisible(true);
    const t = window.setTimeout(() => {
      dismiss();
    }, 12000);
    return () => window.clearTimeout(t);
  }, [searchParams, dismiss]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-4 sm:justify-end sm:p-6">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-emerald-200/80 bg-white p-4 shadow-lg ring-1 ring-black/5 dark:border-emerald-800/60 dark:bg-slate-900 dark:ring-white/10 sm:p-5"
      >
        <div className="flex gap-3">
          <span className="text-2xl leading-none" aria-hidden>
            🎉
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              You&apos;re all set!
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {hasCustomer
                ? 'Your account is ready. Create and send your first invoice.'
                : 'Your account is ready. Add a customer first, then create your first invoice.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={
                  hasCustomer
                    ? '/dashboard/invoices/new'
                    : '/dashboard/customers?add=1&return_to=/dashboard/invoices/new'
                }
                onClick={dismiss}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                {hasCustomer ? 'Create invoice' : 'Add customer'}
              </Link>
              <Link
                href="/dashboard/customers"
                onClick={dismiss}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {hasCustomer ? 'Customers' : 'View customers'}
              </Link>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
