'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'bank_deposit', label: 'Bank Deposit' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'other', label: 'Other' },
] as const;

export type PaymentModalMode = 'full' | 'installment';

/** True after record-payment when the invoice is fully settled (final installment or full pay). */
export function isFinalPaymentComplete(invoice: Record<string, unknown> | undefined | null): boolean {
  if (!invoice) return false;
  const status = String((invoice as { status?: string }).status ?? '').toLowerCase();
  if (status === 'paid') return true;

  const balRaw = (invoice as { balance_due?: unknown }).balance_due;
  if (balRaw != null) {
    const bal = Number(balRaw);
    if (Number.isFinite(bal) && bal <= 0.02) return true;
  }

  const rows = (invoice as { invoice_payment_schedule_items?: unknown }).invoice_payment_schedule_items;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.every((raw) => {
      if (!raw || typeof raw !== 'object') return false;
      return String((raw as { status?: string }).status ?? '').toLowerCase() === 'paid';
    });
  }

  return false;
}

export type PaymentModalProps = {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  mode: PaymentModalMode;
  /** Shown read-only and sent as `amount` to record-payment */
  amount: number;
  /** Invoice remaining balance — validates payment amount */
  remainingBalance: number;
  scheduleItemId?: string | null;
  /** Defaults to z-[110]; use higher when nested over other modals (e.g. schedule UI). */
  overlayZClass?: string;
  /** Invoice issue date (yyyy-MM-dd). Min payment date when set. */
  issueDate?: string | null;
  /** Shown under the title (e.g. assistant in-chat). */
  invoiceNumber?: string | null;
  customerName?: string | null;
  /**
   * When true: title “Record payment”, optional invoice/customer lines, and full-viewport sheet on narrow screens.
   */
  assistantContext?: boolean;
  onSuccess?: (payload: {
    invoice?: Record<string, unknown>;
    paymentRecordedAt?: string | null;
  }) => void;
  onError?: (message: string) => void;
};

export function PaymentModal({
  open,
  onClose,
  invoiceId,
  mode,
  amount,
  remainingBalance,
  scheduleItemId = null,
  overlayZClass = 'z-[110]',
  issueDate = null,
  invoiceNumber = null,
  customerName = null,
  assistantContext = false,
  onSuccess,
  onError,
}: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayYmdLocal);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [narrowViewport, setNarrowViewport] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const fn = () => setNarrowViewport(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const issueYmd =
    issueDate != null && String(issueDate).trim().length >= 10
      ? String(issueDate).trim().slice(0, 10)
      : '';
  const minPaymentDate = /^\d{4}-\d{2}-\d{2}$/.test(issueYmd) ? issueYmd : undefined;
  const maxPaymentDate = todayYmdLocal();

  useEffect(() => {
    if (!open) {
      setPaymentMethod('');
      setPaymentNote('');
      setPaymentError(null);
      setLoading(false);
    } else {
      setPaymentDate(todayYmdLocal());
    }
  }, [open]);

  async function submitPayment() {
    if (loading) return;
    const amt = Number(amount);
    if (!(amt > 0)) {
      setPaymentError('Amount must be greater than 0.');
      return;
    }
    if (amt - remainingBalance > 0.0001) {
      setPaymentError('Amount cannot exceed remaining balance.');
      return;
    }
    if (!paymentMethod) {
      setPaymentError('Select payment method.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setPaymentError('Select a payment date.');
      return;
    }
    if (paymentDate > maxPaymentDate) {
      setPaymentError('Payment date cannot be in the future.');
      return;
    }
    if (minPaymentDate && paymentDate < minPaymentDate) {
      setPaymentError('Payment date cannot be before the invoice issue date.');
      return;
    }

    setLoading(true);
    setPaymentError(null);
    try {
      const body: {
        amount: number;
        paymentMethod: string;
        note: string | null;
        paymentDate: string;
        scheduleItemId?: string;
      } = {
        amount: amt,
        paymentMethod,
        note: paymentNote.trim() || null,
        paymentDate,
      };
      const sid = scheduleItemId != null ? String(scheduleItemId).trim() : '';
      if (sid) body.scheduleItemId = sid;

      const res = await fetch(`/api/invoices/${invoiceId}/record-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        invoice?: Record<string, unknown>;
        payment_recorded_at?: string | null;
      };
      if (!res.ok) {
        const msg = data.error ?? 'Failed to record payment';
        setPaymentError(msg);
        onError?.(msg);
        return;
      }
      onSuccess?.({
        invoice: data.invoice,
        paymentRecordedAt:
          typeof data.payment_recorded_at === 'string' && data.payment_recorded_at.trim().length > 0
            ? data.payment_recorded_at
            : null,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Please retry';
      setPaymentError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const useSheetLayout = assistantContext && narrowViewport;

  return (
    <div
      className={cn(
        `fixed inset-0 ${overlayZClass} flex`,
        useSheetLayout ? 'items-end justify-center p-0 md:items-center md:p-4' : 'items-center justify-center p-4'
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={() => !loading && onClose()}
        aria-label="Close"
      />
      <div
        className={cn(
          'relative w-full border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900',
          useSheetLayout
            ? 'max-h-[100dvh] overflow-y-auto rounded-t-2xl p-5 pb-8 md:max-h-[min(90vh,880px)] md:max-w-md md:rounded-xl md:pb-5'
            : 'max-w-md rounded-xl p-5'
        )}
        data-payment-modal-mode={mode}
      >
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          {assistantContext ? 'Record payment' : 'Mark as paid'}
        </h3>
        {assistantContext && (invoiceNumber || customerName) ? (
          <div className="mt-2 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
            {invoiceNumber ? (
              <p>
                <span className="font-medium text-slate-800 dark:text-slate-200">Invoice</span>{' '}
                {invoiceNumber}
              </p>
            ) : null}
            {customerName ? (
              <p>
                <span className="font-medium text-slate-800 dark:text-slate-200">Customer</span>{' '}
                {customerName}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            Amount
            <input
              type="text"
              readOnly
              aria-readonly="true"
              value={Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}
              className="mt-1 w-full cursor-default rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100"
            />
          </label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            Payment date
            <input
              type="date"
              value={paymentDate}
              min={minPaymentDate}
              max={maxPaymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-zenzex-500 focus:outline-none focus:ring-1 focus:ring-zenzex-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              Defaults to today. Adjust if payment was received earlier.
            </span>
          </label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            Payment method
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-zenzex-500 focus:outline-none focus:ring-1 focus:ring-zenzex-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Select method</option>
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            {assistantContext ? 'Note / reference (optional)' : 'Note (optional)'}
            <textarea
              rows={2}
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-zenzex-500 focus:outline-none focus:ring-1 focus:ring-zenzex-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder={assistantContext ? 'Note or reference' : 'Add payment note'}
            />
          </label>
          {paymentError ? <p className="text-sm text-red-600 dark:text-red-400">{paymentError}</p> : null}
          <p className="text-sm text-red-600 dark:text-red-400">This action cannot be undone</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !loading && onClose()}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submitPayment()}
            disabled={loading}
            className="rounded-lg bg-zenzex-600 px-3 py-2 text-sm font-semibold text-white hover:bg-zenzex-700 disabled:opacity-60"
          >
            {loading ? 'Recording payment...' : 'Confirm payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
