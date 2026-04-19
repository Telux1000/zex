'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatDisplayDate } from '@/lib/utils/date';
import type { InvoiceRecurringSummary } from '@/lib/recurring-invoice/display';
import { RecurringInvoiceModal } from '@/components/invoices/RecurringInvoiceModal';
import { useToasts } from '@/components/feedback/toast/ToastProvider';

type Props = {
  businessId: string;
  recurring: InvoiceRecurringSummary;
  canManage: boolean;
};

const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

export function InvoiceRecurringPreviewSection({ businessId, recurring, canManage }: Props) {
  const router = useRouter();
  const { showSuccessToast, showErrorToast } = useToasts();
  const [editOpen, setEditOpen] = useState(false);
  const [pausing, setPausing] = useState(false);

  const ended = recurring.schedule_status === 'cancelled';
  const paused = recurring.schedule_status === 'paused';
  const active = recurring.schedule_status === 'active';

  const handlePauseToggle = async () => {
    if (ended) return;
    setPausing(true);
    try {
      const nextStatus = active ? 'paused' : 'active';
      const res = await fetch(`/api/recurring-invoices/${recurring.rule_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      showSuccessToast(nextStatus === 'paused' ? 'Recurring schedule paused' : 'Recurring schedule resumed');
      router.refresh();
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPausing(false);
    }
  };

  return (
    <>
      <section
        className="mb-4 rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/90 to-white px-4 py-3.5 dark:border-slate-700/80 dark:from-slate-900/40 dark:to-slate-900/20 print:hidden"
        aria-label="Recurring billing"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-500 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recurring invoice
              </p>
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                <span className="font-medium">{recurring.frequency_label}</span>
                <span className="text-slate-400 dark:text-slate-500"> · </span>
                Next invoice {formatDisplayDate(recurring.next_run_date)}
                <span className="text-slate-400 dark:text-slate-500"> · </span>
                {recurring.automation_label}
              </p>
              {recurring.role === 'template' ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  This invoice is the template for this schedule.
                </p>
              ) : null}
              {ended ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">This schedule has ended.</p>
              ) : paused ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300/90">Schedule is paused — no new invoices until resumed.</p>
              ) : null}
            </div>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Link href="/dashboard/invoices/recurring" className={btnSecondary}>
                View schedule
              </Link>
              {!ended ? (
                <button type="button" onClick={() => setEditOpen(true)} className={btnSecondary}>
                  Edit schedule
                </button>
              ) : null}
              {!ended ? (
                <button
                  type="button"
                  disabled={pausing}
                  onClick={() => void handlePauseToggle()}
                  className={btnSecondary}
                >
                  {pausing ? 'Updating…' : active ? 'Pause schedule' : 'Resume schedule'}
                </button>
              ) : null}
            </div>
          ) : (
            <Link href="/dashboard/invoices/recurring" className={`${btnSecondary} self-start sm:self-auto`}>
              View schedule
            </Link>
          )}
        </div>
      </section>

      {editOpen ? (
        <RecurringInvoiceModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          businessId={businessId}
          editRuleId={recurring.rule_id}
          onCreated={({ message, next_invoice_date }) => {
            showSuccessToast(`${message}. Next invoice: ${formatDisplayDate(next_invoice_date)}`);
            setEditOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
