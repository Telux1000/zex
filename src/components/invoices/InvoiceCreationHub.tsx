'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Sparkles } from 'lucide-react';
import { useDashboardSetupProgress, useHasCustomer } from '@/contexts/DashboardAccessContext';
import { InvoiceCoreSetupBlockedFromContext } from '@/components/onboarding/InvoiceCoreSetupBlockedFromContext';
import { InvoiceCustomerSetupPanel } from '@/components/onboarding/InvoiceCustomerSetupPanel';
import { BusinessAddressInvoiceSoftPrompt } from '@/components/invoices/BusinessAddressInvoiceSoftPrompt';
import type { InvoiceCreationWorkspace } from '@/hooks/use-invoice-creation-workspace';
import { cn } from '@/lib/utils/cn';
import { isSetupProgressFullySatisfied } from '@/lib/onboarding/setup-progress';
import { DASHBOARD_ASSISTANT_HREF } from '@/lib/dashboard/assistant-route';
import { devSetManualInvoiceOpenClickT0 } from '@/lib/dev/manual-invoice-open-timing';
import { devSetAssistantInvoiceChatClickT0 } from '@/lib/dev/assistant-invoice-chat-timing';
import { setHubCustomersCacheForManualEntry } from '@/lib/invoice-creation/hub-customers-hydration';

const cardClassName =
  'group flex min-h-[140px] w-full min-w-0 flex-col justify-between rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow,transform] hover:border-indigo-500/25 hover:shadow-[0_4px_20px_rgba(99,91,255,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:border-slate-700/80 dark:bg-slate-900/40 dark:shadow-none dark:hover:border-indigo-400/30 sm:min-h-[160px] sm:rounded-3xl sm:p-7 md:p-8';

export function InvoiceCreationHub({ workspace }: { workspace: InvoiceCreationWorkspace }) {
  const assistantCreateInvoiceHref = useMemo(() => {
    const session =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `asst_${Date.now()}`;
    const q = new URLSearchParams();
    q.set('session', session);
    q.set('context', 'create_invoice');
    q.set('returnTo', '/dashboard/invoices/new');
    return `${DASHBOARD_ASSISTANT_HREF}?${q.toString()}`;
  }, []);

  const setupProgress = useDashboardSetupProgress();
  const hasCustomerInContext = useHasCustomer();
  const {
    businessId,
    businessAddressLine1,
    customersFetchState,
    allCustomers,
    invoiceHubReturnTo,
  } = workspace;

  const coreSetupDone = isSetupProgressFullySatisfied(setupProgress);
  const hasAnyCustomer =
    hasCustomerInContext || (customersFetchState === 'resolved' && allCustomers.length > 0);
  const customersListPending =
    coreSetupDone && !hasCustomerInContext && customersFetchState !== 'resolved';

  if (!coreSetupDone) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-10 pb-6 text-[var(--foreground)] sm:px-0 sm:pb-8">
        <InvoiceCoreSetupBlockedFromContext />
      </div>
    );
  }

  if (customersListPending) {
    return (
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col items-center justify-center gap-3 px-4 py-20 text-sm text-[var(--muted)] sm:px-0">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400"
          aria-hidden
        />
        <p>Loading…</p>
      </div>
    );
  }

  if (!hasAnyCustomer) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-4xl space-y-8 pb-6 text-[var(--foreground)] sm:space-y-10 sm:pb-8">
        <InvoiceCustomerSetupPanel returnTo={invoiceHubReturnTo} />
        <p className="text-center text-xs text-[var(--muted)]">
          <Link
            href="/dashboard/invoices"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Back to invoices
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-8 pb-6 text-[var(--foreground)] sm:space-y-10 sm:pb-8">
      <header className="space-y-2 sm:space-y-3">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-[var(--foreground)] sm:text-3xl">
          You&apos;re ready to create invoices
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
          Create and send your first invoice.
        </p>
      </header>

      {businessId != null && !String(businessAddressLine1 ?? '').trim() ? (
        <BusinessAddressInvoiceSoftPrompt />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <Link
          href={assistantCreateInvoiceHref}
          className={cardClassName}
          onClick={() => devSetAssistantInvoiceChatClickT0()}
        >
          <div className="flex items-start gap-4">
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm ring-1 ring-inset ring-white/15',
                'sm:h-12 sm:w-12'
              )}
              aria-hidden
            >
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-lg">
                AI-assisted
              </p>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                Create an invoice by chatting, typing, speaking, or uploading a screenshot.
              </p>
            </div>
          </div>
          <span className="mt-5 flex items-center justify-end gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Create invoice
            <ChevronRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </Link>

        <Link
          href="/dashboard/invoices/new?mode=form"
          onClick={() => {
            if (typeof performance !== 'undefined') {
              devSetManualInvoiceOpenClickT0(performance.now());
            }
            if (businessId) {
              setHubCustomersCacheForManualEntry(businessId, allCustomers);
            }
          }}
          className={cardClassName}
          aria-label="Manual invoice entry"
        >
          <div className="flex items-start gap-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm dark:border-slate-600 dark:bg-slate-800 sm:h-12 sm:w-12"
              aria-hidden
            >
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-lg">
                Manual
              </p>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                Enter the invoice yourself using the form.
              </p>
            </div>
          </div>
          <span className="mt-5 flex items-center justify-end gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Create invoice
            <ChevronRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </Link>
      </div>

      <p className="text-center text-xs text-[var(--muted)]">
        <Link
          href="/dashboard/invoices"
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Back to invoices
        </Link>
      </p>
    </div>
  );
}
