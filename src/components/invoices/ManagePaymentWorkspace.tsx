'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { statusLabel } from '@/lib/invoices/edit-rules';
import { InvoicePreviewSaved } from '@/components/invoices/InvoicePreview';
import ManualInvoiceForm, { type EditModeInitialData } from '@/components/invoices/ManualInvoiceForm';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import type { SavedInvoice } from '@/types/invoice-preview';
import { isFinalPaymentComplete, PaymentModal } from '@/components/invoices/PaymentModal';

function mapScheduleItemsForSavedPreview(
  items: unknown
): NonNullable<SavedInvoice['payment_schedule']> {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id ?? ''),
      description: String(r.description ?? ''),
      amount: Number(r.amount ?? 0),
      due_date: String(r.due_date ?? '').slice(0, 10),
      status: r.status === 'paid' ? ('paid' as const) : ('pending' as const),
      paid_at: r.paid_at ? String(r.paid_at) : null,
    };
  });
}

/** DB rows or API camelCase paymentSchedule from PATCH response. */
function scheduleRowsFromSaveResponse(data: Record<string, unknown>): unknown[] {
  const snake = data.invoice_payment_schedule_items;
  if (Array.isArray(snake) && snake.length > 0) return snake;
  const camel = data.paymentSchedule;
  if (!Array.isArray(camel) || camel.length === 0) return [];
  return camel.map((raw) => {
    const p = raw as Record<string, unknown>;
    const due = p.due_date ?? p.dueDate;
    const st = String(p.status ?? '').toLowerCase();
    return {
      id: p.id,
      description: String(p.description ?? ''),
      amount: p.amount,
      due_date: due != null ? String(due).slice(0, 10) : '',
      status: st === 'paid' ? 'paid' : 'pending',
      paid_at: p.paid_at ?? null,
    };
  });
}

type ScheduleRow = {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string | null;
};

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  usePaymentSchedule: boolean;
  amountPaid: number;
  scheduleRows: ScheduleRow[];
  previewData: {
    business: Record<string, unknown>;
    invoice: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
  };
  editInitialData: EditModeInitialData;
};

export function ManagePaymentWorkspace({
  invoiceId,
  invoiceNumber,
  status,
  usePaymentSchedule,
  amountPaid,
  scheduleRows,
  previewData,
  editInitialData,
}: Props) {
  const router = useRouter();
  const { showSuccessToast, showErrorToast } = useToasts();
  const [paymentModalConfig, setPaymentModalConfig] = useState<{
    mode: 'full' | 'installment';
    amount: number;
    scheduleItemId: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState(usePaymentSchedule);
  const [postSavePreviewPatch, setPostSavePreviewPatch] = useState<Partial<SavedInvoice> | null>(null);

  const serverScheduleFingerprint = useMemo(
    () => scheduleRows.map((r) => `${r.id}:${r.amount}:${r.due_date}`).join('|'),
    [scheduleRows]
  );

  useEffect(() => {
    setPostSavePreviewPatch(null);
  }, [serverScheduleFingerprint]);

  const displayPreviewData = useMemo(() => {
    if (!postSavePreviewPatch) return previewData;
    const inv = previewData.invoice as SavedInvoice;
    return {
      ...previewData,
      invoice: {
        ...inv,
        ...postSavePreviewPatch,
        payment_schedule: postSavePreviewPatch.payment_schedule ?? inv.payment_schedule,
      },
    };
  }, [previewData, postSavePreviewPatch]);

  const isVoided = status === 'voided';
  const isPaid = status === 'paid';
  const pendingRows = useMemo(
    () => scheduleRows.filter((r) => (r.status ?? 'pending') === 'pending'),
    [scheduleRows]
  );
  const hasPaidScheduleRows = useMemo(
    () => scheduleRows.some((r) => (r.status ?? 'pending') === 'paid'),
    [scheduleRows]
  );
  const scheduleLockedAfterFirstPayment = useMemo(
    () => Boolean(scheduleMode && usePaymentSchedule && hasPaidScheduleRows),
    [scheduleMode, usePaymentSchedule, hasPaidScheduleRows]
  );
  const scheduleInitialData = useMemo(() => {
    const hasRows = Array.isArray(editInitialData.payment_schedule) && editInitialData.payment_schedule.length > 0;
    return {
      ...editInitialData,
      invoice: {
        ...editInitialData.invoice,
        use_payment_schedule: true,
      },
      payment_schedule: hasRows
        ? editInitialData.payment_schedule
        : [
            {
              description: 'Deposit',
              amount: Number((editInitialData.invoice.balance_due ?? editInitialData.invoice.total ?? 0) * 0.3),
              percentage: 30,
              due_date: String(editInitialData.invoice.issue_date ?? editInitialData.invoice.due_date ?? ''),
              status: 'pending' as const,
            },
            {
              description: 'Balance',
              amount: Number((editInitialData.invoice.balance_due ?? editInitialData.invoice.total ?? 0) * 0.7),
              percentage: 70,
              due_date: String(editInitialData.invoice.due_date ?? editInitialData.invoice.issue_date ?? ''),
              status: 'pending' as const,
            },
          ],
    };
  }, [editInitialData]);
  const nextPending = pendingRows[0] ?? null;
  const totalAmount = Number((editInitialData.invoice.total ?? 0) || 0);
  const currentPaidAmount = Number((editInitialData.invoice.amount_paid ?? amountPaid ?? 0) || 0);
  const currentBalanceDue = Math.max(
    0,
    Number(
      (editInitialData.invoice.balance_due ??
        ((previewData.invoice as { balance_due?: number | null }).balance_due ?? (totalAmount - currentPaidAmount))) || 0
    )
  );
  const canRecordPayment = !isVoided && currentBalanceDue > 0.0001;
  const latestPaidAt = useMemo(() => {
    const paidRows = scheduleRows.filter((r) => (r.status ?? 'pending') === 'paid' && r.paid_at);
    if (paidRows.length === 0) return null;
    return String(
      paidRows
        .map((r) => String(r.paid_at))
        .sort()
        .slice(-1)[0] ?? ''
    );
  }, [scheduleRows]);

  useEffect(() => {
    if (usePaymentSchedule && hasPaidScheduleRows) {
      setScheduleMode(true);
    }
  }, [usePaymentSchedule, hasPaidScheduleRows]);

  useEffect(() => {
    if (isPaid && scheduleMode) {
      setScheduleMode(false);
    }
  }, [isPaid, scheduleMode]);

  function closePaymentModal() {
    setPaymentModalConfig(null);
  }

  function openMarkPaidModal(
    installment?: { scheduleItemId: string; installmentAmount: number } | null
  ) {
    if (!canRecordPayment) return;
    if (installment?.scheduleItemId && Number(installment.installmentAmount) > 0) {
      const amt = Number(installment.installmentAmount);
      if (amt - currentBalanceDue > 0.0001) {
        showErrorToast('Installment amount exceeds remaining balance.');
        return;
      }
      setPaymentModalConfig({
        mode: 'installment',
        amount: amt,
        scheduleItemId: installment.scheduleItemId,
      });
    } else if (scheduleMode) {
      if (!nextPending) {
        setError('No pending scheduled payment available.');
        return;
      }
      const amt = Math.max(0, Math.min(Number(nextPending.amount ?? 0), currentBalanceDue));
      setPaymentModalConfig({
        mode: 'installment',
        amount: amt,
        scheduleItemId: String(nextPending.id),
      });
    } else {
      setPaymentModalConfig({
        mode: 'full',
        amount: currentBalanceDue,
        scheduleItemId: null,
      });
    }
    setError(null);
  }

  function ActionRow() {
    if (isVoided) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {canRecordPayment && !scheduleMode ? (
          <button
            type="button"
            onClick={() => openMarkPaidModal()}
            className="rounded-lg bg-zenzex-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zenzex-700"
          >
            Mark as paid
          </button>
        ) : null}
        {!scheduleMode && !isPaid ? (
          <button
            type="button"
            onClick={() => setScheduleMode(true)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Payment Plan
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {saveNotice && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
          {saveNotice}
        </p>
      )}

      {scheduleMode && !isVoided && !isPaid && (
        <div className="mt-6 min-w-0 space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/invoices/${invoiceId}`)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to Invoice
            </button>
          </div>
          <ManualInvoiceForm
            key={`manage-payment-schedule-${invoiceId}`}
            mode="edit"
            invoiceId={invoiceId}
            editInvoiceNumber={invoiceNumber}
            initialData={scheduleInitialData}
            paymentScheduleOnly
            paymentScheduleWithPreview
            paymentScheduleSavedOnServer={usePaymentSchedule}
            onUnsavedPaymentScheduleDiscarded={() => setScheduleMode(false)}
            onOpenRecordPaymentFromSchedule={(args) => openMarkPaidModal(args)}
            disableSchedulePaymentActions={false}
            onSaved={({ data }) => {
              const d = data as Record<string, unknown> & {
                invoice_payment_schedule_items?: unknown[];
                use_payment_schedule?: boolean;
              };
              const rows = scheduleRowsFromSaveResponse(d);
              const scheduleStillEnabled = Boolean(d?.use_payment_schedule);
              const hasPaid = rows.some((r) => String((r as { status?: string }).status ?? '') === 'paid');
              if (hasPaid) {
                window.location.href = `/dashboard/invoices/${invoiceId}?saved=1`;
                return;
              }
              if (!scheduleStillEnabled) {
                setScheduleMode(false);
              }
              if (rows.length > 0) {
                const full = data as Record<string, unknown>;
                setPostSavePreviewPatch({
                  payment_schedule: mapScheduleItemsForSavedPreview(rows),
                  amount_paid: full.amount_paid != null ? Number(full.amount_paid) : undefined,
                  balance_due: full.balance_due != null ? Number(full.balance_due) : undefined,
                  total: full.total != null ? Number(full.total) : undefined,
                  due_date: full.due_date != null ? String(full.due_date) : undefined,
                });
              }
              setSaveNotice('Payment schedule saved.');
              void router.refresh();
              requestAnimationFrame(() => {
                showSuccessToast('Invoice saved');
              });
            }}
          />
        </div>
      )}

      {!(scheduleMode && !isVoided && !isPaid) ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-sm font-medium',
              status === 'paid'
                ? 'bg-zenzex-100 text-zenzex-800 dark:bg-zenzex-900/50 dark:text-zenzex-300'
                : status === 'voided'
                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
            )}
          >
            {statusLabel(status)}
          </span>
          {isPaid && latestPaidAt ? (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Paid on {new Date(latestPaidAt).toLocaleDateString()}
            </span>
          ) : null}
          <ActionRow />
        </div>
      ) : null}

      {!scheduleMode && !scheduleLockedAfterFirstPayment && (
        <div className="invoice-print-container">
          <InvoicePreviewSaved source="saved" data={displayPreviewData as any} />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      )}

      <PaymentModal
        open={paymentModalConfig !== null}
        onClose={closePaymentModal}
        invoiceId={invoiceId}
        mode={paymentModalConfig?.mode ?? 'full'}
        amount={paymentModalConfig?.amount ?? 0}
        remainingBalance={currentBalanceDue}
        scheduleItemId={paymentModalConfig?.scheduleItemId ?? null}
        issueDate={String(editInitialData.invoice.issue_date ?? '').slice(0, 10)}
        onSuccess={({ invoice }) => {
          if (invoice && isFinalPaymentComplete(invoice)) {
            showSuccessToast('Payment complete. Invoice fully paid.');
            router.push(`/dashboard/invoices/${invoiceId}`);
            return;
          }
          showSuccessToast('Payment recorded');
          router.refresh();
        }}
        onError={(msg) => showErrorToast(msg)}
      />

    </div>
  );
}
