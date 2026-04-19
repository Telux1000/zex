'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canEdit, isLocked } from '@/lib/invoices/edit-rules';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { Download, Pencil, Printer, Send, EllipsisVertical, Mail, Wallet, Repeat, Bell, Calendar } from 'lucide-react';
import { RecurringInvoiceModal } from '@/components/invoices/RecurringInvoiceModal';
import { AutoRemindersModal } from '@/components/invoices/AutoRemindersModal';
import { ScheduleSendModal } from '@/components/invoices/ScheduleSendModal';
import { formatDisplayDate } from '@/lib/utils/date';
import { canManageAutoReminders } from '@/lib/invoices/auto-reminders-eligibility';
import type { AutoRemindersInitialPayload } from '@/lib/invoices/auto-reminders-eligibility';
import { RefundPaymentModal } from '@/components/invoices/RefundPaymentModal';

type Props = {
  businessId: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  /** Server: show Refund when captured payments exist and refundable remainder > 0. */
  showRefundAction: boolean;
  amountPaid?: number;
  customerMissing?: boolean;
  dueDate: string;
  invoiceTotal: number;
  invoiceBalanceDue: number;
  invoiceAmountPaid: number;
  autoRemindersInitial: AutoRemindersInitialPayload;
  onAutoRemindersSaved?: () => void;
  scheduledSendAtIso?: string | null;
  /** Business account IANA timezone (server source of truth for schedule send). */
  accountTimezone: string;
  onScheduleSendSaved?: () => void;
};

export function InvoicePreviewActions({
  businessId,
  invoiceId,
  invoiceNumber,
  status,
  showRefundAction,
  amountPaid = 0,
  customerMissing = false,
  dueDate,
  invoiceTotal,
  invoiceBalanceDue,
  invoiceAmountPaid,
  autoRemindersInitial,
  onAutoRemindersSaved,
  scheduledSendAtIso = null,
  accountTimezone,
  onScheduleSendSaved,
}: Props) {
  const router = useRouter();
  const { showErrorToast, showSuccessToast } = useToasts();
  const [open, setOpen] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [autoRemindersOpen, setAutoRemindersOpen] = useState(false);
  const [scheduleSendOpen, setScheduleSendOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [profileReady, setProfileReady] = useState<null | boolean>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/business/profile-status')
      .then((res) => res.ok ? res.json() : { isComplete: false })
      .then((data: { isComplete?: boolean }) => {
        if (!cancelled) setProfileReady(Boolean(data.isComplete));
      })
      .catch(() => {
        if (!cancelled) setProfileReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleVoid = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'voided', void_reason: voidReason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Void failed');
      }
      setVoidModalOpen(false);
      setVoidReason('');
      setOpen(false);
      router.refresh();
    } catch (e) {
      showErrorToast('Something went wrong. Please retry');
    } finally {
      setLoading(false);
    }
  };

  const allowEdit = canEdit(status);
  const locked = isLocked(status);
  const normalizedStatus = String(status).toLowerCase();
  const isPaidLike =
    normalizedStatus === 'paid' ||
    normalizedStatus === 'partially_refunded' ||
    normalizedStatus === 'refunded';
  const isDraft = normalizedStatus === 'draft';
  const isSent = ['sent', 'viewed', 'overdue', 'partially_paid', 'paid'].includes(normalizedStatus);
  const showDraftSendActions = isDraft && !locked;
  const showResendAndReminder = isSent && !isPaidLike && !locked;

  const showAutoRemindersMenu = canManageAutoReminders({
    status,
    total: invoiceTotal,
    amount_paid: invoiceAmountPaid,
    balance_due: invoiceBalanceDue,
  });

  const primaryManagePayment =
    ['sent', 'viewed', 'overdue', 'partially_paid', 'pending'].includes(normalizedStatus) && !isPaidLike && !locked;
  const primaryEditDraft = isDraft && allowEdit;
  const showSecondaryEdit = allowEdit && !isDraft;
  const secondaryBtnClass =
    'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zenzex-500/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-4';
  const primaryBtnClass =
    'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:bg-indigo-500 dark:hover:bg-indigo-400 sm:px-4';

  const handleDownload = async () => {
    if (profileReady === false) {
      showErrorToast('Complete your business profile before sending or downloading invoices.');
      return;
    }
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string })?.error ?? 'Couldn’t download PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Couldn’t download PDF');
    }
  };

  const handleDuplicate = async () => {
    try {
      const res = await fetch('/api/invoices/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: invoiceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? 'Failed to duplicate invoice');
      const nextId = String((data as { id?: string }).id ?? '').trim();
      if (!nextId) throw new Error('Duplicate invoice created but ID missing');
      showSuccessToast('Invoice duplicated');
      window.location.href = `/dashboard/invoices/${nextId}`;
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Couldn’t duplicate invoice');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleResendInvoice = async () => {
    if (profileReady === false) {
      showErrorToast('Complete your business profile before sending or downloading invoices.');
      return;
    }
    if (customerMissing) {
      showErrorToast('Add a customer before sending this invoice.');
      return;
    }
    setResending(true);
    try {
      const res = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, mode: 'send_invoice' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      showSuccessToast('Invoice resent');
      router.refresh();
    } catch {
      showErrorToast("Couldn’t resend invoice. Try again");
    } finally {
      setResending(false);
    }
  };

  const handleSendReminderNow = async () => {
    if (profileReady === false) {
      showErrorToast('Complete your business profile before sending reminders.');
      return;
    }
    if (customerMissing) {
      showErrorToast('Add a customer email before sending a reminder.');
      return;
    }
    setReminderSending(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send-reminder`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      if ((data as { skipped?: boolean }).skipped) {
        showSuccessToast('Nothing to send (already paid).');
      } else {
        showSuccessToast('Reminder sent');
      }
      router.refresh();
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Couldn’t send reminder");
    } finally {
      setReminderSending(false);
    }
  };

  const handleSend = async (forceClearSchedule?: boolean) => {
    if (profileReady === false) {
      showErrorToast('Complete your business profile before sending or downloading invoices.');
      return;
    }
    if (customerMissing) {
      showErrorToast('Add a customer before sending this invoice.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          mode: 'send_invoice',
          ...(forceClearSchedule ? { force_clear_schedule: true } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && (data as { needsScheduleOverride?: boolean }).needsScheduleOverride) {
        const ok =
          typeof window !== 'undefined' &&
          window.confirm(
            'This invoice is scheduled to send later. Send now anyway? The scheduled send will be cancelled.'
          );
        if (ok) {
          await handleSend(true);
          return;
        }
        throw new Error('Cancelled');
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      showSuccessToast('Invoice sent');
      router.refresh();
    } catch (e) {
      if (e instanceof Error && e.message === 'Cancelled') {
        /* user dismissed confirm */
      } else {
        showErrorToast(e instanceof Error ? e.message : "Couldn’t send invoice. Try again");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto sm:gap-3">
          {showSecondaryEdit ? (
            <Link
              href={`/dashboard/invoices/${invoiceId}/edit`}
              className={secondaryBtnClass}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Edit</span>
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void handleDownload()}
            aria-label="Download invoice"
            className={secondaryBtnClass}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            aria-label="Print invoice"
            className={secondaryBtnClass}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {primaryEditDraft ? (
            <Link href={`/dashboard/invoices/${invoiceId}/edit`} className={primaryBtnClass}>
              <Pencil className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Edit invoice</span>
              <span className="sm:hidden">Edit</span>
            </Link>
          ) : null}
          {primaryManagePayment ? (
            <Link href={`/dashboard/invoices/${invoiceId}/manage-payment`} className={primaryBtnClass}>
              <Wallet className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Manage payment</span>
              <span className="sm:hidden">Pay</span>
            </Link>
          ) : null}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zenzex-500/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              aria-label="More actions"
              aria-expanded={open}
            >
              <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            {open ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-48 overflow-visible rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
              >
                {allowEdit && !showSecondaryEdit && !primaryEditDraft ? (
                  <Link
                    href={`/dashboard/invoices/${invoiceId}/edit`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                  >
                    Edit invoice
                  </Link>
                ) : null}
                {status !== 'voided' && !isPaidLike && !primaryManagePayment ? (
                  <Link
                    href={`/dashboard/invoices/${invoiceId}/manage-payment`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                  >
                    Manage payment
                  </Link>
                ) : null}
                {showRefundAction ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRefundOpen(true);
                      setOpen(false);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                  >
                    Refund
                  </button>
                ) : null}
                {showDraftSendActions ? (
                  <>
                    <button
                      type="button"
                      disabled={sending || profileReady === false || customerMissing}
                      onClick={() => {
                        void handleSend();
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] disabled:opacity-50 dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                    >
                      <Send className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      {sending ? 'Sending…' : 'Send now'}
                    </button>
                    <button
                      type="button"
                      disabled={profileReady === false || customerMissing}
                      onClick={() => {
                        setScheduleSendOpen(true);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] disabled:opacity-50 dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                    >
                      <Calendar className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      Schedule send
                    </button>
                  </>
                ) : null}
                {showResendAndReminder ? (
                  <>
                    <button
                      type="button"
                      disabled={resending || profileReady === false || customerMissing}
                      onClick={() => {
                        void handleResendInvoice();
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] disabled:opacity-50 dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                    >
                      <Send className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      {resending ? 'Resending…' : 'Resend invoice'}
                    </button>
                    <button
                      type="button"
                      disabled={reminderSending || profileReady === false || customerMissing}
                      onClick={() => {
                        void handleSendReminderNow();
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] disabled:opacity-50 dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                    >
                      <Mail className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      {reminderSending ? 'Sending…' : 'Send reminder'}
                    </button>
                    {showAutoRemindersMenu ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAutoRemindersOpen(true);
                          setOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                      >
                        <Bell className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        Auto Reminders
                      </button>
                    ) : null}
                  </>
                ) : null}
                {!locked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setVoidModalOpen(true);
                      setOpen(false);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                  >
                    Void invoice
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void handleDuplicate();
                    setOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                >
                  Duplicate invoice
                </button>
                {normalizedStatus !== 'voided' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRecurringOpen(true);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]"
                  >
                    <Repeat className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                    Create recurring invoice
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {scheduleSendOpen ? (
        <ScheduleSendModal
          open={scheduleSendOpen}
          onClose={() => setScheduleSendOpen(false)}
          invoiceId={invoiceId}
          initialScheduledAtIso={scheduledSendAtIso}
          accountTimezone={accountTimezone}
          onSaved={onScheduleSendSaved}
        />
      ) : null}

      {autoRemindersOpen ? (
        <AutoRemindersModal
          open={autoRemindersOpen}
          onClose={() => setAutoRemindersOpen(false)}
          invoiceId={invoiceId}
          dueDate={dueDate}
          useCustomerReminderDefaults={autoRemindersInitial.useCustomerReminderDefaults}
          reminderSettings={autoRemindersInitial.reminderSettings}
          customerReminderSettings={autoRemindersInitial.customerReminderSettings}
          onSaved={onAutoRemindersSaved}
        />
      ) : null}

      {recurringOpen ? (
        <RecurringInvoiceModal
          open={recurringOpen}
          onClose={() => setRecurringOpen(false)}
          businessId={businessId}
          sourceInvoiceId={invoiceId}
          onCreated={({ message, next_invoice_date }) => {
            showSuccessToast(
              `${message}. Next invoice: ${formatDisplayDate(next_invoice_date)}`
            );
          }}
        />
      ) : null}

      {voidModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close void confirmation"
            onClick={() => {
              if (loading) return;
              setVoidModalOpen(false);
              setVoidReason('');
            }}
          />
          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Void this invoice?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              This will cancel the invoice and it will no longer be payable. This action cannot be undone.
            </p>
            {amountPaid > 0 && (
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
                  setVoidModalOpen(false);
                  setVoidReason('');
                }}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={loading}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Voiding…' : 'Void Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
      <RefundPaymentModal
        open={refundOpen}
        invoiceId={invoiceId}
        onClose={() => setRefundOpen(false)}
        onSuccess={() => {
          showSuccessToast('Refund processed');
          router.refresh();
        }}
        onError={(message) => showErrorToast(message)}
      />
    </>
  );
}
