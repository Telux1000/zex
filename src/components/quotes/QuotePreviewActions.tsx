'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { encodeManualConfirmationMethod, type ConfirmationMethodId } from '@/lib/quotes/confirmation-method';

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'accepted_customer' | 'rejected_customer';

const secondaryBtn =
  'app-btn-secondary inline-flex items-center justify-center disabled:opacity-60';

const primaryBtn = 'app-btn-primary inline-flex items-center justify-center disabled:opacity-60';

const destructiveBtn = 'app-btn-destructive inline-flex items-center justify-center disabled:opacity-60';

const menuItemClass =
  'block w-full px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]';

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-400/25';

const labelClass = 'text-xs font-medium text-slate-600 dark:text-slate-400';

export function QuotePreviewActions({
  quoteId,
  status,
  convertedInvoiceId,
}: {
  quoteId: string;
  status: string;
  convertedInvoiceId?: string | null;
}) {
  const router = useRouter();
  const { showSuccessToast, showErrorToast } = useToasts();
  const [loading, setLoading] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [acceptConfirmationMethod, setAcceptConfirmationMethod] = useState<ConfirmationMethodId | ''>('');
  const [acceptOtherSpec, setAcceptOtherSpec] = useState('');
  const [acceptAdditionalNote, setAcceptAdditionalNote] = useState('');
  const [acceptConfirmationError, setAcceptConfirmationError] = useState<string | null>(null);

  const [rejectConfirmationMethod, setRejectConfirmationMethod] = useState<ConfirmationMethodId | ''>('');
  const [rejectOtherSpec, setRejectOtherSpec] = useState('');
  const [rejectAdditionalNote, setRejectAdditionalNote] = useState('');
  const [rejectConfirmationError, setRejectConfirmationError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const s = status as QuoteStatus;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!acceptOpen) return;
    setAcceptConfirmationMethod('');
    setAcceptOtherSpec('');
    setAcceptAdditionalNote('');
    setAcceptConfirmationError(null);
  }, [acceptOpen]);

  useEffect(() => {
    if (!rejectOpen) return;
    setRejectConfirmationMethod('');
    setRejectOtherSpec('');
    setRejectAdditionalNote('');
    setRejectConfirmationError(null);
  }, [rejectOpen]);

  function downloadPdf() {
    window.print();
    setMenuOpen(false);
  }

  async function updateStatusSent() {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not update status');
      router.refresh();
    } catch (err) {
      showErrorToast('Couldn’t update quote. Try again');
    } finally {
      setLoading(false);
    }
  }

  async function confirmAccept() {
    setLoading(true);
    try {
      if (!acceptConfirmationMethod) {
        setAcceptConfirmationError('Select how this was confirmed');
        return;
      }

      const accepted_via = encodeManualConfirmationMethod(acceptConfirmationMethod, acceptOtherSpec);

      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'accepted',
          accepted_via,
          accepted_note: acceptAdditionalNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.error ?? 'Couldn’t update quote. Try again');
        return;
      }
      setAcceptOpen(false);
      setAcceptConfirmationMethod('');
      setAcceptOtherSpec('');
      setAcceptAdditionalNote('');
      showSuccessToast('Quote marked as accepted');
      router.refresh();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Couldn’t update quote. Try again');
    } finally {
      setLoading(false);
    }
  }

  async function confirmReject() {
    setLoading(true);
    try {
      if (!rejectConfirmationMethod) {
        setRejectConfirmationError('Select how this was confirmed');
        return;
      }

      const rejected_via = encodeManualConfirmationMethod(rejectConfirmationMethod, rejectOtherSpec);

      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejected_via,
          rejection_reason: rejectAdditionalNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.error ?? 'Couldn’t update quote. Try again');
        return;
      }
      setRejectOpen(false);
      setRejectConfirmationMethod('');
      setRejectOtherSpec('');
      setRejectAdditionalNote('');
      showSuccessToast('Quote marked as rejected');
      router.refresh();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Couldn’t update quote. Try again');
    } finally {
      setLoading(false);
    }
  }

  async function convertToInvoice() {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/convert`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not convert quote');
      setConvertOpen(false);
      showSuccessToast('Quote converted');
      router.push(`/dashboard/invoices/${data.invoice_id}`);
      router.refresh();
    } catch (err) {
      showErrorToast('Something went wrong. Please retry');
    } finally {
      setLoading(false);
    }
  }

  async function duplicateQuote() {
    setLoading(true);
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not duplicate');
      router.push(`/dashboard/quotes/${data.id}/edit`);
      router.refresh();
    } catch (err) {
      showErrorToast('Something went wrong. Please retry');
    } finally {
      setLoading(false);
    }
  }

  async function deleteQuote() {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not delete');
      setDeleteOpen(false);
      setMenuOpen(false);
      router.push('/dashboard/quotes');
      router.refresh();
    } catch (err) {
      showErrorToast('Something went wrong. Please retry');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex w-full max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
        {s === 'draft' ? (
          <>
            <Link href={`/dashboard/quotes/${quoteId}/edit`} className={secondaryBtn}>
              Edit
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={() => void updateStatusSent()}
              className={primaryBtn}
            >
              Send Quote
            </button>
          </>
        ) : null}

        {s === 'sent' ? (
          <>
            <Link href={`/dashboard/quotes/${quoteId}/edit`} className={secondaryBtn}>
              Edit
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={() => setRejectOpen(true)}
              className={destructiveBtn}
            >
              Reject
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setAcceptOpen(true)}
              className={primaryBtn}
            >
              Accept
            </button>
          </>
        ) : null}

        {s === 'accepted' ? (
          <>
            {convertedInvoiceId ? (
              <Link href={`/dashboard/invoices/${convertedInvoiceId}`} className={primaryBtn}>
                View Invoice
              </Link>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => setConvertOpen(true)}
                className={primaryBtn}
              >
                Convert to Invoice
              </button>
            )}
          </>
        ) : null}

        {s === 'rejected' || s === 'expired' ? (
          <Link href={`/dashboard/quotes/${quoteId}/edit`} className={secondaryBtn}>
            Edit
          </Link>
        ) : null}

        <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="More actions"
              disabled={loading}
              onClick={() => setMenuOpen((o) => !o)}
              className="app-btn-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center !p-0 text-slate-600 dark:text-slate-300"
            >
              <EllipsisVertical className="h-5 w-5" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg"
              >
                <button type="button" role="menuitem" className={menuItemClass} onClick={() => downloadPdf()}>
                  Download PDF
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  disabled={loading}
                  onClick={() => void duplicateQuote()}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${menuItemClass} text-rose-600 dark:text-rose-400`}
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
      </div>

      {convertOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60"
          role="presentation"
          onClick={() => !loading && setConvertOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-convert-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="quote-convert-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Convert this quote into an invoice?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              A new draft invoice will be created from this quote.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setConvertOpen(false)}
                className={secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void convertToInvoice()}
                className={primaryBtn}
              >
                {loading ? 'Converting to invoice...' : 'Convert to Invoice'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {acceptOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60"
          role="presentation"
          onClick={() => !loading && setAcceptOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-accept-title"
            className="max-h-[min(90vh,32rem)] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="quote-accept-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Mark quote as accepted?
            </h2>
            <label className="mt-4 block">
              <span className={labelClass}>How was this confirmed?</span>
              <select
                value={acceptConfirmationMethod}
                onChange={(e) => {
                  setAcceptConfirmationMethod(e.target.value as ConfirmationMethodId | '');
                  setAcceptConfirmationError(null);
                }}
                className={`${inputClass} appearance-none`}
                required
              >
                <option value="" disabled>
                  Select...
                </option>
                <option value="phone_call">Via phone call</option>
                <option value="whatsapp">Via WhatsApp</option>
                <option value="in_person">In person</option>
                <option value="verbal_agreement">Verbal agreement</option>
                <option value="courier">Courier</option>
                <option value="other">Other</option>
              </select>
              {acceptConfirmationError ? (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{acceptConfirmationError}</p>
              ) : null}
            </label>

            {acceptConfirmationMethod === 'other' ? (
              <label className="mt-4 block">
                <span className={labelClass}>Please specify</span>
                <input
                  value={acceptOtherSpec}
                  onChange={(e) => setAcceptOtherSpec(e.target.value)}
                  className={inputClass}
                  type="text"
                  placeholder="e.g. via email follow-up"
                  required
                />
              </label>
            ) : null}

            <label className="mt-4 block">
              <span className={labelClass}>Additional note (optional)</span>
              <textarea
                value={acceptAdditionalNote}
                onChange={(e) => setAcceptAdditionalNote(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="e.g. Pricing confirmed after review"
              />
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setAcceptOpen(false)}
                className={secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirmAccept()}
                className={primaryBtn}
              >
                Confirm acceptance
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60"
          role="presentation"
          onClick={() => !loading && setRejectOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-reject-title"
            className="max-h-[min(90vh,32rem)] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="quote-reject-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Mark quote as rejected?
            </h2>
            <label className="mt-4 block">
              <span className={labelClass}>How was this confirmed?</span>
              <select
                value={rejectConfirmationMethod}
                onChange={(e) => {
                  setRejectConfirmationMethod(e.target.value as ConfirmationMethodId | '');
                  setRejectConfirmationError(null);
                }}
                className={`${inputClass} appearance-none`}
                required
              >
                <option value="" disabled>
                  Select...
                </option>
                <option value="phone_call">Via phone call</option>
                <option value="whatsapp">Via WhatsApp</option>
                <option value="in_person">In person</option>
                <option value="verbal_agreement">Verbal agreement</option>
                <option value="courier">Courier</option>
                <option value="other">Other</option>
              </select>
              {rejectConfirmationError ? (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{rejectConfirmationError}</p>
              ) : null}
            </label>

            {rejectConfirmationMethod === 'other' ? (
              <label className="mt-4 block">
                <span className={labelClass}>Please specify</span>
                <input
                  value={rejectOtherSpec}
                  onChange={(e) => setRejectOtherSpec(e.target.value)}
                  className={inputClass}
                  type="text"
                  placeholder="e.g. via email follow-up"
                  required
                />
              </label>
            ) : null}

            <label className="mt-4 block">
              <span className={labelClass}>Additional note (optional)</span>
              <textarea
                value={rejectAdditionalNote}
                onChange={(e) => setRejectAdditionalNote(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="e.g. Customer declined pricing"
              />
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setRejectOpen(false)}
                className={secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirmReject()}
                className={destructiveBtn}
              >
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60"
          role="presentation"
          onClick={() => !loading && setDeleteOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete quote?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">This cannot be undone.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setDeleteOpen(false)}
                className={secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void deleteQuote()}
                className={destructiveBtn}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
