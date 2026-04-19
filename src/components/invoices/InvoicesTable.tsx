'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { formatDisplayDate, formatPaidAtTableSubtitle } from '@/lib/utils/date';
import { formatMoneyCodeFirst } from '@/lib/utils/currency';
import { cn } from '@/lib/utils/cn';
import { canEdit, canDelete, canVoid, statusLabel } from '@/lib/invoices/edit-rules';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import type { InvoiceRecurringSummary } from '@/lib/recurring-invoice/display';
import { CalendarClock, Clock, RefreshCw } from 'lucide-react';
import { invoiceShowsAutoReminderIndicator } from '@/lib/invoices/auto-reminders-display';
import { computeInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { RefundPaymentModal } from '@/components/invoices/RefundPaymentModal';
import { canShowRefundMenuAction } from '@/lib/invoices/refund-display';

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  currency?: string;
  issue_date?: string | null;
  total: number;
  total_in_base?: number;
  exchange_rate_to_base?: number;
  amount_paid?: number;
  balance_due?: number;
  total_refunded?: number;
  use_payment_schedule?: boolean;
  next_due_date?: string | null;
  remaining_installments?: number;
  status: string;
  due_date: string;
  /** Set when status is paid (from `invoices.paid_at`). */
  paid_at?: string | null;
  /** Latest succeeded payment timestamp for partially paid rows (from `payments`). */
  latest_payment_at?: string | null;
  created_at?: string;
  /** Present when this row is the recurring template or a run generated from a rule */
  recurring?: InvoiceRecurringSummary | null;
  /** From list API when migration supports reminder columns */
  use_customer_reminder_defaults?: boolean;
  reminder_settings?: unknown;
  customer_reminder_settings?: unknown | null;
  /** ISO instant when a pending reminder exists (list API). */
  next_reminder_at?: string | null;
  /** When set on a draft, invoice email is scheduled (cron). */
  scheduled_send_at?: string | null;
  gross_paid_amount?: number;
  /** Net retained after refunds (list API); prefer for partially_refunded rows. */
  net_paid_amount?: number;
  refunded_amount?: number;
  available_refundable_amount?: number;
  /** Server: matches refund API when remainder > 0. */
  refund_action_eligible?: boolean;
};

type Props = {
  invoices: InvoiceRow[];
  businessId: string;
  /** Company base / reporting currency */
  currency: string;
  currentStatus: string | undefined;
  statusColors: Record<string, string>;
  /** If provided, use this for status badge (e.g. show Overdue when due_date passed) */
  displayStatusForInv?: (inv: InvoiceRow) => string;
  /** Called after void, delete, or duplicate so the list can refetch */
  onMutationSuccess?: () => void;
};

function invoiceShowsScheduledSendIndicator(inv: InvoiceRow): boolean {
  return inv.status === 'draft' && Boolean(inv.scheduled_send_at && String(inv.scheduled_send_at).trim() !== '');
}

function InvoiceStatusCell({
  inv,
  displayStatusKey,
  statusColors,
  showAutoReminderIcon,
  showScheduledSendIcon,
}: {
  inv: InvoiceRow;
  displayStatusKey: string;
  statusColors: Record<string, string>;
  showAutoReminderIcon: boolean;
  showScheduledSendIcon?: boolean;
}) {
  const paidSubtitle =
    displayStatusKey === 'paid' ? formatPaidAtTableSubtitle(inv.paid_at ?? null) : null;
  const partialSubtitle =
    displayStatusKey === 'partially_paid'
      ? formatPaidAtTableSubtitle(inv.latest_payment_at ?? null, {
          tooltipKind: 'last_payment_on',
        })
      : null;
  const partialRefundSubtitle =
    displayStatusKey === 'partially_refunded'
      ? (() => {
          const { balance } = invoiceAmounts(inv);
          const cur = inv.currency ?? 'USD';
          return {
            line: `Balance due ${formatMoneyCodeFirst(balance, cur)}`,
            title: `Balance due ${formatMoneyCodeFirst(balance, cur)}`,
          };
        })()
      : null;

  if (displayStatusKey === 'paid') {
    return (
      <div className="flex min-w-0 max-w-[11rem] flex-col gap-1 self-start">
        <span
          className={cn(
            'inline-flex w-fit max-w-full shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            statusColors.paid ??
              'bg-zenzex-100 text-zenzex-800 dark:bg-zenzex-900/50 dark:text-zenzex-300'
          )}
        >
          Paid
        </span>
        {paidSubtitle ? (
          <span
            className="block whitespace-nowrap text-[11px] leading-snug text-slate-500 dark:text-slate-400"
            title={paidSubtitle.title}
          >
            {paidSubtitle.line}
          </span>
        ) : null}
      </div>
    );
  }

  if (displayStatusKey === 'partially_refunded') {
    return (
      <div className="flex min-w-0 max-w-[11rem] flex-col gap-1 self-start">
        <span className="flex items-center gap-1.5">
          <span className="block text-xs font-semibold leading-tight text-rose-800 dark:text-rose-300">
            {statusLabel('partially_refunded')}
          </span>
          {showAutoReminderIcon ? (
            <span className="inline-flex" title="Payment reminder scheduled">
              <Clock
                className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-85 dark:text-slate-500"
                aria-label="Payment reminder scheduled"
              />
            </span>
          ) : null}
        </span>
        {partialRefundSubtitle ? (
          <span
            className="block whitespace-nowrap text-[11px] leading-snug text-slate-500 dark:text-slate-400"
            title={partialRefundSubtitle.title}
          >
            {partialRefundSubtitle.line}
          </span>
        ) : null}
      </div>
    );
  }

  if (displayStatusKey === 'partially_paid') {
    return (
      <div className="flex min-w-0 max-w-[11rem] flex-col gap-1 self-start">
        <span className="flex items-center gap-1.5">
          <span className="block text-xs font-semibold leading-tight text-amber-800 dark:text-amber-300">
            {statusLabel('partially_paid')}
          </span>
          {showAutoReminderIcon ? (
            <span className="inline-flex" title="Payment reminder scheduled">
              <Clock
                className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-85 dark:text-slate-500"
                aria-label="Payment reminder scheduled"
              />
            </span>
          ) : null}
        </span>
        {partialSubtitle ? (
          <span
            className="block whitespace-nowrap text-[11px] leading-snug text-slate-500 dark:text-slate-400"
            title={partialSubtitle.title}
          >
            {partialSubtitle.line}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 self-start">
      <span
        className={cn(
          'inline-flex max-w-full shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
          statusColors[displayStatusKey] ??
            'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
        )}
      >
        {statusLabel(displayStatusKey)}
      </span>
      {showScheduledSendIcon ? (
        <span className="inline-flex" title="Invoice send scheduled">
          <CalendarClock
            className="h-3.5 w-3.5 shrink-0 text-indigo-500/85 dark:text-indigo-400/85"
            aria-label="Invoice send scheduled"
          />
        </span>
      ) : null}
      {showAutoReminderIcon ? (
        <span className="inline-flex" title="Payment reminder scheduled">
          <Clock
            className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-85 dark:text-slate-500"
            aria-label="Payment reminder scheduled"
          />
        </span>
      ) : null}
    </span>
  );
}

function RecurringInvoiceListBadge({ recurring }: { recurring: InvoiceRecurringSummary }) {
  const ended = recurring.schedule_status === 'cancelled';
  return (
    <span
      title={`${recurring.frequency_label} · Next ${formatDisplayDate(recurring.next_run_date)}${ended ? ' · Ended' : ''}`}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 rounded-md border px-1 py-px text-[10px] font-medium uppercase tracking-wide',
        ended
          ? 'border-slate-200/50 bg-slate-100/40 text-slate-400 dark:border-slate-700/50 dark:bg-slate-800/30 dark:text-slate-500'
          : 'border-slate-200/70 bg-white/90 text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.04)] dark:border-slate-600/70 dark:bg-slate-800/40 dark:text-slate-400'
      )}
    >
      <RefreshCw className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden />
      <span>Recurring</span>
    </span>
  );
}

function balanceInBase(inv: InvoiceRow, base: string): number | null {
  const st = String(inv.status ?? '').toLowerCase();
  const balanceRaw = inv.balance_due;
  const bal = st === 'voided' || st === 'cancelled'
    ? 0
    : balanceRaw != null && Number.isFinite(Number(balanceRaw))
      ? Math.max(0, Number(balanceRaw))
      : computeInvoiceBalanceDue(
          Number(inv.total ?? 0),
          Number(inv.amount_paid ?? 0),
          Number(inv.total_refunded ?? 0)
        );
  const rate = Number(inv.exchange_rate_to_base ?? 1);
  const invCur = (inv.currency ?? base).toUpperCase();
  if (invCur === base.toUpperCase()) return null;
  return bal * rate;
}

function invoiceAmounts(inv: InvoiceRow) {
  const total = Number(inv.total ?? 0);
  const st = String(inv.status ?? '').toLowerCase();
  const refunded = Math.max(0, Number(inv.total_refunded ?? inv.refunded_amount ?? 0));
  /** Gross payments recorded on the invoice (before refunds). */
  const paid = Math.max(0, Number(inv.gross_paid_amount ?? inv.amount_paid ?? 0));
  const balanceRaw = inv.balance_due;
  const balance = st === 'voided' || st === 'cancelled'
    ? 0
    : balanceRaw != null && Number.isFinite(Number(balanceRaw))
      ? Math.max(0, Number(balanceRaw))
      : computeInvoiceBalanceDue(total, Number(inv.amount_paid ?? 0), refunded);
  return { total, paid, refunded, balance };
}

function isPaidLikeForManagePayment(status: string): boolean {
  const s = String(status ?? '').toLowerCase();
  return s === 'paid' || s === 'partially_refunded' || s === 'refunded';
}

function invoiceRowShowsRefundMenu(inv: InvoiceRow | null | undefined): boolean {
  if (!inv) return false;
  if (typeof inv.refund_action_eligible === 'boolean') return inv.refund_action_eligible;
  return canShowRefundMenuAction({
    status: inv.status,
    grossPaidSucceeded: Number(inv.gross_paid_amount ?? 0),
    refundedSucceededAndPending: Number(inv.refunded_amount ?? 0),
  });
}

export function InvoicesTable({ invoices, businessId, currency, currentStatus, statusColors, displayStatusForInv, onMutationSuccess }: Props) {
  const router = useRouter();
  const { showErrorToast, showSuccessToast } = useToasts();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [voidModal, setVoidModal] = useState<{
    id: string;
    invoiceNumber: string;
    hasPayments: boolean;
  } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ id: string; invoiceNumber: string } | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refundInvoice, setRefundInvoice] = useState<{ id: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const desktopTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const mobileTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  const openRefundFromRow = useCallback((invoiceId: string) => {
    // Match invoice section opener pattern: open refund first, then close action menu.
    setRefundInvoice({ id: invoiceId });
    setOpenMenuId(null);
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [openMenuId]);

  const updateMenuPosition = useCallback(
    (invoiceId: string) => {
      const trigger = isDesktop
        ? desktopTriggerRefs.current[invoiceId]
        : mobileTriggerRefs.current[invoiceId];
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const triggerGap = 6;
      const menuWidth = 192; // 12rem
      const estimatedMenuHeight = 260;

      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUpward = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

      const left = Math.max(
        viewportPadding,
        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
      );
      const top = openUpward
        ? Math.max(viewportPadding, rect.top - estimatedMenuHeight - triggerGap)
        : Math.min(window.innerHeight - estimatedMenuHeight - viewportPadding, rect.bottom + triggerGap);

      setMenuPosition({ top, left, openUpward });
    },
    [isDesktop]
  );

  useEffect(() => {
    if (!openMenuId) {
      setMenuPosition(null);
      return;
    }
    updateMenuPosition(openMenuId);
  }, [openMenuId, isDesktop, updateMenuPosition]);

  useEffect(() => {
    if (!openMenuId) return;
    const onViewportChange = () => updateMenuPosition(openMenuId);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [openMenuId, updateMenuPosition]);

  const handleDuplicate = useCallback(
    async (id: string) => {
      if (duplicatingId || deletingId || voidingId) return;
      setOpenMenuId(null);
      setDuplicatingId(id);
      try {
        const res = await fetch('/api/invoices/duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_id: id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Duplicate failed');
        if (data.id) router.push(`/dashboard/invoices/${data.id}/edit?duplicated=1`);
        else { onMutationSuccess?.(); router.refresh(); }
      } catch (e) {
        showErrorToast('Something went wrong. Please retry');
      } finally {
        setDuplicatingId(null);
      }
    },
    [router, onMutationSuccess, duplicatingId, deletingId, voidingId, showErrorToast]
  );

  const handleVoid = useCallback(
    async (id: string, reason?: string) => {
      if (voidingId || deletingId || duplicatingId) return;
      setVoidingId(id);
      try {
        const res = await fetch(`/api/invoices/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'voided', void_reason: reason?.trim() || undefined }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Void failed');
        }
        setVoidModal(null);
        setVoidReason('');
        setOpenMenuId(null);
        onMutationSuccess?.();
        router.refresh();
      } catch (e) {
        showErrorToast('Something went wrong. Please retry');
      } finally {
        setVoidingId(null);
      }
    },
    [router, onMutationSuccess, voidingId, deletingId, duplicatingId, showErrorToast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (deletingId || duplicatingId || voidingId) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Delete failed');
        }
        setDeleteModal(null);
        setOpenMenuId(null);
        onMutationSuccess?.();
        router.refresh();
        showSuccessToast('Draft invoice deleted');
      } catch (e) {
        const message = e instanceof Error && e.message ? e.message : 'Delete failed. Please retry';
        showErrorToast(message);
      } finally {
        setDeletingId(null);
      }
    },
    [router, onMutationSuccess, deletingId, duplicatingId, voidingId, showErrorToast, showSuccessToast]
  );

  const activeInvoice = openMenuId ? invoices.find((invoice) => invoice.id === openMenuId) : null;
  const activeStatus = String(activeInvoice?.status ?? '').toLowerCase();
  const activeIsPaidLike = isPaidLikeForManagePayment(activeStatus);
  const showRefundInMenu = invoiceRowShowsRefundMenu(activeInvoice ?? undefined);
  const nonDraftDeleteGuidance =
    activeStatus === 'sent' || activeStatus === 'partially_paid' || activeStatus === 'partially_refunded'
      ? 'Deletion disabled. Use void/cancel. Refund applies if payment exists.'
      : activeStatus === 'paid' || activeStatus === 'refunded'
        ? showRefundInMenu
          ? 'Deletion disabled. Use refund, then cancel/void if needed.'
          : 'Deletion disabled. Use cancel/void if needed.'
        : null;

  return (
    <div className="app-table-shell mt-6">
      {/* Mobile: card list */}
      <div className="divide-y divide-slate-200 dark:divide-slate-800 md:hidden">
        {(invoices ?? []).length === 0 ? null : (invoices ?? []).map((inv) => {
          const statusKey = displayStatusForInv ? displayStatusForInv(inv) : inv.status;
          const { total, paid, refunded, balance } = invoiceAmounts(inv);
          const invCur = inv.currency ?? currency;
          const showAutoReminderIcon = invoiceShowsAutoReminderIndicator({
            status: inv.status,
            total: inv.total,
            amount_paid: inv.amount_paid,
            balance_due: inv.balance_due,
            use_customer_reminder_defaults: inv.use_customer_reminder_defaults,
            reminder_settings: inv.reminder_settings,
            customer_reminder_settings: inv.customer_reminder_settings,
            next_reminder_at: inv.next_reminder_at,
          });
          const showScheduledSendIcon = invoiceShowsScheduledSendIndicator(inv);
          return (
            <div key={inv.id} className="flex cursor-pointer items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <Link
                href={`/dashboard/invoices/${inv.id}`}
                className="min-w-0 flex-1 py-1"
                aria-label={`View invoice ${inv.invoice_number}`}
              >
                <span className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  {inv.invoice_number}
                </span>
                {inv.recurring ? <RecurringInvoiceListBadge recurring={inv.recurring} /> : null}
                <p className="truncate text-xs text-slate-600 dark:text-slate-400">{inv.customer_name}</p>
                <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Issue {formatDisplayDate(inv.issue_date || inv.created_at || inv.due_date)}
                  </span>
                  <span>
                    Due {formatDisplayDate(inv.next_due_date || inv.due_date)}
                    {!!inv.use_payment_schedule && (inv.remaining_installments ?? 0) > 0 && (
                      <> • {inv.remaining_installments} left</>
                    )}
                  </span>
                  {inv.status === 'paid' || inv.status === 'partially_paid' ? (
                    <div className="w-full min-w-0 basis-full">
                      <InvoiceStatusCell
                        inv={inv}
                        displayStatusKey={statusKey}
                        statusColors={statusColors}
                        showAutoReminderIcon={showAutoReminderIcon}
                        showScheduledSendIcon={showScheduledSendIcon}
                      />
                    </div>
                  ) : (
                    <InvoiceStatusCell
                      inv={inv}
                      displayStatusKey={statusKey}
                      statusColors={statusColors}
                      showAutoReminderIcon={showAutoReminderIcon}
                      showScheduledSendIcon={showScheduledSendIcon}
                    />
                  )}
                  <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                    <span className="block">
                      Total {formatMoneyCodeFirst(total, invCur)}
                    </span>
                    <span className="block">
                      Paid {formatMoneyCodeFirst(paid, invCur)}
                    </span>
                    {refunded > 0.0001 ? (
                      <span className="block text-rose-700 dark:text-rose-300">
                        Refunded {formatMoneyCodeFirst(refunded, invCur)}
                      </span>
                    ) : null}
                    <span className="block">
                      Balance {formatMoneyCodeFirst(balance, invCur)}
                    </span>
                    {total > 0 && balanceInBase(inv, currency) != null ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {formatMoneyCodeFirst(
                          total * Number(inv.exchange_rate_to_base ?? 1),
                          currency
                        )}
                      </span>
                    ) : null}
                  </span>
                </div>
              </Link>
              <div className="relative z-30 shrink-0 -mr-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  ref={(el) => {
                    mobileTriggerRefs.current[inv.id] = el;
                  }}
                  onClick={() => {
                    if (openMenuId === inv.id) {
                      setOpenMenuId(null);
                      return;
                    }
                    setDeleteModal(null);
                    setOpenMenuId(inv.id);
                    setTimeout(() => updateMenuPosition(inv.id), 0);
                  }}
                  className={cn(
                    'flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full',
                    'text-sm font-normal leading-none text-slate-600 transition-[color,background-color,box-shadow] duration-200 ease-out',
                    'dark:text-slate-300',
                    'hover:bg-slate-200/80 hover:text-slate-900 active:bg-slate-300/70 dark:hover:bg-slate-700/80 dark:hover:text-slate-50 dark:active:bg-slate-600/70',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950',
                    openMenuId === inv.id &&
                      'bg-slate-200/90 text-slate-900 shadow-sm ring-1 ring-slate-300/60 dark:bg-slate-700 dark:text-white dark:ring-slate-600/80'
                  )}
                  aria-label="Invoice actions"
                  aria-expanded={openMenuId === inv.id}
                >
                  <span aria-hidden className="block translate-y-px">
                    ⋮
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {(!invoices || invoices.length === 0) && (
        <div className="px-5 py-12 text-center text-slate-500 md:py-12">
          No invoices found.{' '}
          <Link href="/dashboard/invoices/new" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Create your first invoice
          </Link>
        </div>
      )}
      {/* Desktop: table */}
      {invoices && invoices.length > 0 && (
      <div className="app-table-scroll hidden md:block">
        <table className="app-table">
          <thead>
            <tr>
              <th className="app-th">
                Number
              </th>
              <th className="app-th">
                Customer
              </th>
              <th className="app-th">
                Issue Date
              </th>
              <th className="app-th">
                Due Date
              </th>
              <th className="app-th">
                Status
              </th>
              <th className="app-th-num">
                Total
              </th>
              <th className="app-th-num">
                Paid
              </th>
              <th className="app-th-num">
                Refunded
              </th>
              <th className="app-th-num">
                Balance
              </th>
              <th className="w-10 px-2 py-3 md:w-12" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="app-tbody">
            {(invoices ?? []).map((inv) => {
              const { total, paid, refunded, balance } = invoiceAmounts(inv);
              const invCur = inv.currency ?? currency;
              const showAutoReminderIcon = invoiceShowsAutoReminderIndicator({
                status: inv.status,
                total: inv.total,
                amount_paid: inv.amount_paid,
                balance_due: inv.balance_due,
                use_customer_reminder_defaults: inv.use_customer_reminder_defaults,
                reminder_settings: inv.reminder_settings,
                customer_reminder_settings: inv.customer_reminder_settings,
                next_reminder_at: inv.next_reminder_at,
              });
              const showScheduledSendIcon = invoiceShowsScheduledSendIndicator(inv);
              return (
              <tr
                key={inv.id}
                role="button"
                tabIndex={0}
                className="app-tr-hover cursor-pointer focus-visible:bg-slate-50 focus:outline-none dark:focus-visible:bg-slate-800/50"
                onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/dashboard/invoices/${inv.id}`);
                  }
                }}
                aria-label={`View invoice ${inv.invoice_number}`}
              >
                <td className="app-td">
                  <div className="flex max-w-[10rem] flex-col gap-1">
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {inv.invoice_number}
                    </span>
                    {inv.recurring ? <RecurringInvoiceListBadge recurring={inv.recurring} /> : null}
                  </div>
                </td>
                <td className="app-td-secondary">
                  {inv.customer_name}
                </td>
                <td className="app-td-secondary">
                  {formatDisplayDate(inv.issue_date || inv.created_at || inv.due_date)}
                </td>
                <td className="app-td-secondary">
                  <span>
                    {formatDisplayDate(inv.next_due_date || inv.due_date)}
                    {!!inv.use_payment_schedule && (inv.remaining_installments ?? 0) > 0 && (
                      <span className="text-slate-500 dark:text-slate-400"> • {inv.remaining_installments} left</span>
                    )}
                  </span>
                </td>
                <td className="app-td align-top">
                  <InvoiceStatusCell
                    inv={inv}
                    displayStatusKey={displayStatusForInv ? displayStatusForInv(inv) : inv.status}
                    statusColors={statusColors}
                    showAutoReminderIcon={showAutoReminderIcon}
                    showScheduledSendIcon={showScheduledSendIcon}
                  />
                </td>
                <td className="app-td-num font-medium">
                  <span className="block">
                    {formatMoneyCodeFirst(total, invCur)}
                  </span>
                  {total > 0 && balanceInBase(inv, currency) != null ? (
                    <span className="mt-0.5 block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                      {formatMoneyCodeFirst(
                        total * Number(inv.exchange_rate_to_base ?? 1),
                        currency
                      )}
                    </span>
                  ) : null}
                </td>
                <td className="app-td-num font-medium">
                  {formatMoneyCodeFirst(paid, invCur)}
                </td>
                <td className="app-td-num font-medium">
                  {refunded > 0.0001 ? (
                    <span className="text-rose-700 dark:text-rose-300">
                      {formatMoneyCodeFirst(refunded, invCur)}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">—</span>
                  )}
                </td>
                <td className="app-td-num font-medium">
                  {formatMoneyCodeFirst(balance, invCur)}
                </td>
                <td
                  className="relative w-10 px-2 py-3 md:w-12"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end">
                    <button
                      type="button"
                      ref={(el) => {
                        desktopTriggerRefs.current[inv.id] = el;
                      }}
                      onClick={() => {
                        if (openMenuId === inv.id) {
                          setOpenMenuId(null);
                          return;
                        }
                        setDeleteModal(null);
                        setOpenMenuId(inv.id);
                        setTimeout(() => updateMenuPosition(inv.id), 0);
                      }}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full',
                        'text-sm font-normal leading-none text-slate-500 transition-[color,background-color,box-shadow] duration-200 ease-out',
                        'dark:text-slate-400',
                        'hover:bg-slate-200/75 hover:text-slate-800 dark:hover:bg-slate-700/55 dark:hover:text-slate-100',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950',
                        openMenuId === inv.id &&
                          'bg-slate-200/85 text-slate-900 ring-1 ring-slate-300/55 dark:bg-slate-700 dark:text-white dark:ring-slate-600/70'
                      )}
                      aria-label="Row actions"
                      aria-expanded={openMenuId === inv.id}
                    >
                      <span aria-hidden className="block translate-y-px">
                        ⋮
                      </span>
                    </button>
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
      )}
      {openMenuId && menuPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className={cn(
            'fixed z-[100] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800',
            menuPosition.openUpward ? 'origin-bottom-right' : 'origin-top-right'
          )}
          style={{ top: menuPosition.top, left: menuPosition.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="truncate pr-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              {activeInvoice?.invoice_number ?? ''}
            </span>
            <button
              type="button"
              onClick={() => setOpenMenuId(null)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              aria-label="Close actions menu"
            >
              ×
            </button>
          </div>
          <Link
            href={`/dashboard/invoices/${openMenuId}`}
            onClick={() => setOpenMenuId(null)}
            className="block px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
          >
            View
          </Link>
          {canEdit(activeInvoice?.status ?? '') && (
            <Link
              href={`/dashboard/invoices/${openMenuId}/edit`}
              onClick={() => setOpenMenuId(null)}
              className="block px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
            >
              Edit
            </Link>
          )}
          {!activeIsPaidLike && (activeInvoice?.status ?? '') !== 'voided' && (
            <Link
              href={`/dashboard/invoices/${openMenuId}/manage-payment`}
              onClick={() => setOpenMenuId(null)}
              className="block px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
            >
              Manage Payment
            </Link>
          )}
          {showRefundInMenu ? (
            <button
              type="button"
              onClick={() => {
                if (!openMenuId) return;
                openRefundFromRow(openMenuId);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
            >
              Refund
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleDuplicate(openMenuId)}
            disabled={duplicatingId === openMenuId || !!deletingId || !!voidingId}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] disabled:opacity-50 dark:text-slate-200 dark:hover:bg-indigo-400/10"
          >
            {duplicatingId === openMenuId ? 'Duplicating…' : 'Duplicate'}
          </button>
          <>
              {(((activeInvoice?.status ?? '') === 'draft' && canDelete(activeInvoice?.status ?? '')) ||
                ((((activeInvoice?.status ?? '') === 'sent' ||
                  (activeInvoice?.status ?? '') === 'partially_paid' ||
                  (activeInvoice?.status ?? '') === 'partially_refunded') &&
                  canVoid(activeInvoice?.status ?? '')))) && (
                <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
              )}
              {((activeInvoice?.status ?? '') === 'sent' ||
                (activeInvoice?.status ?? '') === 'partially_paid' ||
                (activeInvoice?.status ?? '') === 'partially_refunded') &&
                canVoid(activeInvoice?.status ?? '') && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    setVoidReason('');
                    setVoidModal({
                      id: openMenuId,
                      invoiceNumber: activeInvoice?.invoice_number ?? '',
                      hasPayments: Number(activeInvoice?.amount_paid ?? 0) > 0,
                    });
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
                >
                  Void Invoice
                </button>
              )}
              {(activeInvoice?.status ?? '') === 'draft' && canDelete(activeInvoice?.status ?? '') && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    setDeleteModal({
                      id: openMenuId,
                      invoiceNumber: activeInvoice?.invoice_number ?? '',
                    });
                  }}
                  disabled={!!deletingId}
                  className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-slate-50 dark:text-red-400 dark:hover:bg-slate-700"
                >
                  Delete Draft Invoice
                </button>
              )}
              {nonDraftDeleteGuidance && (
                <p className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {nonDraftDeleteGuidance}
                </p>
              )}
            </>
        </div>,
        document.body
      )}
      {voidModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close void confirmation"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (voidingId === voidModal.id) return;
              setVoidModal(null);
              setVoidReason('');
            }}
          />
          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Void this invoice?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              This will cancel the invoice and it will no longer be payable. This action cannot be undone.
            </p>
            {voidModal.hasPayments && (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                This invoice has recorded payments. Voiding it will not remove those payments.
              </p>
            )}
            <label className="mt-3 block text-sm text-slate-600 dark:text-slate-300">
              Reason for void (optional)
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Add a short reason"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setVoidModal(null);
                  setVoidReason('');
                }}
                disabled={voidingId === voidModal.id}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleVoid(voidModal.id, voidReason)}
                disabled={voidingId === voidModal.id}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {voidingId === voidModal.id ? 'Voiding…' : 'Void Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close delete confirmation"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (deletingId === deleteModal.id) return;
              setDeleteModal(null);
            }}
          />
          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Delete draft invoice?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This action cannot be undone.</p>
            <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">{deleteModal.invoiceNumber}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                disabled={deletingId === deleteModal.id}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteModal.id)}
                disabled={deletingId === deleteModal.id}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId === deleteModal.id ? 'Deleting...' : 'Delete draft'}
              </button>
            </div>
          </div>
        </div>
      )}
      <RefundPaymentModal
        open={refundInvoice !== null}
        invoiceId={refundInvoice?.id ?? null}
        onClose={() => setRefundInvoice(null)}
        onSuccess={() => {
          showSuccessToast('Refund processed');
          onMutationSuccess?.();
          router.refresh();
        }}
        onError={(message) => showErrorToast(message)}
      />
    </div>
  );
}
