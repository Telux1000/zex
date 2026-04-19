'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDisplayDate } from '@/lib/utils/date';
import { formatMoneyCodeFirst } from '@/lib/utils/currency';
import { hasPriorInvoiceRefunds, REFUND_UI_EPS } from '@/lib/invoices/refund-display';

const REFUND_REASON_OPTIONS = [
  { value: 'duplicate_payment', label: 'Duplicate payment' },
  { value: 'customer_request', label: 'Customer request' },
  { value: 'service_issue', label: 'Service issue' },
  { value: 'billing_correction', label: 'Billing correction' },
  { value: 'other', label: 'Other' },
] as const;

type RefundSummary = {
  invoice_number: string;
  customer_name: string;
  currency: string;
  paid_at: string | null;
  /** Sum of succeeded capture amounts for this invoice (invoice currency). */
  amount_paid: number;
  refunded_so_far: number;
  available_refundable_amount: number;
  /** Number of succeeded payment rows aggregated into amount_paid. */
  succeeded_payment_count?: number;
};

type Props = {
  open: boolean;
  invoiceId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function RefundPaymentModal({ open, invoiceId, onClose, onSuccess, onError }: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [summary, setSummary] = useState<RefundSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [refundMode, setRefundMode] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState('');
  const [reason, setReason] = useState<string>('customer_request');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refundableAmount = Number(summary?.available_refundable_amount ?? 0);
  const currency = summary?.currency ?? 'USD';
  const multiSucceededPayments =
    typeof summary?.succeeded_payment_count === 'number' && summary.succeeded_payment_count > 1;
  const priorRefunds = summary ? hasPriorInvoiceRefunds(summary.refunded_so_far) : false;
  const requestedAmount = useMemo(() => {
    if (refundMode === 'full') return refundableAmount;
    const n = Number(partialAmount);
    return Number.isFinite(n) ? n : 0;
  }, [partialAmount, refundMode, refundableAmount]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !invoiceId) return;
    setLoadingSummary(true);
    setSummary(null);
    setError(null);
    setConfirming(false);
    fetch(`/api/invoices/${invoiceId}/refund`, { cache: 'no-store' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          invoice?: RefundSummary;
        };
        if (!res.ok) throw new Error(data.error ?? 'Failed to load refund details');
        setSummary(data.invoice ?? null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to load refund details';
        setError(msg);
        onError?.(msg);
      })
      .finally(() => {
        setLoadingSummary(false);
      });
  }, [open, invoiceId, onError]);

  useEffect(() => {
    if (!open) {
      setSummary(null);
      setLoadingSummary(false);
      setRefundMode('full');
      setPartialAmount('');
      setReason('customer_request');
      setNote('');
      setConfirming(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!summary) return;
    if (hasPriorInvoiceRefunds(summary.refunded_so_far)) {
      setRefundMode('full');
      setPartialAmount('');
    }
  }, [summary]);

  function validateBeforeConfirm(): boolean {
    if (!(refundableAmount > REFUND_UI_EPS)) {
      setError('No refundable amount remains.');
      return false;
    }
    if (refundMode === 'partial') {
      const amount = Number(partialAmount);
      if (!(amount > 0)) {
        setError('Refund amount must be greater than 0.');
        return false;
      }
      if (amount - refundableAmount > REFUND_UI_EPS) {
        setError(
          priorRefunds
            ? 'Refund amount cannot exceed what is available to refund.'
            : 'Refund amount cannot exceed available refundable amount.'
        );
        return false;
      }
    }
    if (!reason) {
      setError('Please select a refund reason.');
      return false;
    }
    setError(null);
    return true;
  }

  async function submitRefund() {
    if (!invoiceId || !summary || submitting) return;
    const amount = refundMode === 'full' ? refundableAmount : Number(partialAmount);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/refund`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: refundMode,
          amount,
          reason,
          note: note.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to process refund');
      onSuccess?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to process refund';
      setError(msg);
      onError?.(msg);
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !isMounted) return null;

  const content = (
    <div className="fixed inset-0 z-[130] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close refund modal"
        className="absolute inset-0 bg-black/45"
        onClick={() => {
          if (submitting) return;
          onClose();
        }}
      />
      <div
        className={`relative w-full border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${
          isMobile
            ? 'h-[100svh] max-h-[100svh] rounded-none'
            : 'h-auto max-h-[90dvh] overflow-y-auto sm:max-w-xl sm:rounded-2xl'
        }`}
      >
        <div
          className={`flex items-center justify-between border-b border-slate-200 dark:border-slate-700 ${
            isMobile
              ? 'sticky top-0 z-10 bg-white px-4 py-3 dark:bg-slate-900'
              : 'px-5 py-4'
          }`}
        >
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Refund payment</h3>
          <button
            type="button"
            onClick={() => {
              if (submitting) return;
              onClose();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close refund modal"
          >
            ×
          </button>
        </div>
        <div
          className={`${
            isMobile
              ? 'h-[calc(100svh-57px)] overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4'
              : 'p-5'
          }`}
        >
        {loadingSummary ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Loading refund details...</p>
        ) : summary ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{summary.invoice_number}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Customer</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{summary.customer_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount paid</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {formatMoneyCodeFirst(summary.amount_paid, currency)}
                </p>
                {multiSucceededPayments ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Total of {summary.succeeded_payment_count} successful payments
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Paid date</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {multiSucceededPayments
                    ? 'Multiple payments'
                    : summary.paid_at
                      ? formatDisplayDate(summary.paid_at)
                      : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Refunded so far</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {formatMoneyCodeFirst(summary.refunded_so_far, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {priorRefunds ? 'Available to refund' : 'Available refundable amount'}
                </p>
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatMoneyCodeFirst(summary.available_refundable_amount, currency)}
                </p>
              </div>
            </div>

            {!(refundableAmount > REFUND_UI_EPS) ? (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
                No refundable amount remains on this invoice.
              </p>
            ) : !confirming ? (
              <div className="mt-4 space-y-3">
                {priorRefunds ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRefundMode('full');
                        setPartialAmount('');
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        refundMode === 'full'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200'
                          : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      Refund remaining
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundMode('partial')}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        refundMode === 'partial'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200'
                          : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      Refund another amount
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRefundMode('full');
                        setPartialAmount('');
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        refundMode === 'full'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200'
                          : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      Full refund
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundMode('partial')}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        refundMode === 'partial'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200'
                          : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      Partial refund
                    </button>
                  </div>
                )}
                {refundMode === 'partial' ? (
                  <label className="block text-sm text-slate-700 dark:text-slate-200">
                    {priorRefunds ? 'Amount to refund' : 'Refund amount'}
                    <input
                      type="number"
                      min="0"
                      max={refundableAmount > 0 ? refundableAmount : undefined}
                      step="0.01"
                      inputMode="decimal"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                ) : null}
                <label className="block text-sm text-slate-700 dark:text-slate-200">
                  Refund reason
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {REFUND_REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-700 dark:text-slate-200">
                  Internal note (optional)
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add internal context"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!validateBeforeConfirm()) return;
                      setConfirming(true);
                    }}
                    disabled={submitting || !(refundableAmount > REFUND_UI_EPS)}
                    className="rounded-lg bg-zenzex-600 px-3 py-2 text-sm font-semibold text-white hover:bg-zenzex-700 disabled:opacity-60"
                  >
                    Refund
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                  {refundMode === 'full'
                    ? priorRefunds
                      ? `Refund the remaining balance (${formatMoneyCodeFirst(requestedAmount, currency)}) for ${summary.invoice_number}?`
                      : `Refund the full paid balance (${formatMoneyCodeFirst(requestedAmount, currency)}) for ${summary.invoice_number}?`
                    : `Refund ${formatMoneyCodeFirst(requestedAmount, currency)} for ${summary.invoice_number}?`}
                </p>
                {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={submitting}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitRefund()}
                    disabled={submitting}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {submitting ? 'Refunding...' : 'Confirm refund'}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Unable to load refund details.</p>
        )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
