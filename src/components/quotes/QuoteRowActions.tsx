'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { encodeManualConfirmationMethod, type ConfirmationMethodId } from '@/lib/quotes/confirmation-method';

const secondaryBtn =
  'app-btn-secondary px-3 py-2 text-xs font-medium disabled:opacity-60 sm:px-4 sm:text-sm';

const primaryBtnSm =
  'app-btn-primary px-3 py-2 text-xs font-semibold disabled:opacity-60 sm:px-4 sm:text-sm';

const destructiveBtnSm =
  'app-btn-destructive px-3 py-2 text-xs font-semibold disabled:opacity-60 sm:px-4 sm:text-sm';

const menuItemClass =
  'block w-full cursor-pointer px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-500/[0.1]';

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white';

const labelClass = 'text-xs font-medium text-slate-600 dark:text-slate-400';

const MENU_MIN_W = 160;
const MENU_GAP = 8;
const MOBILE_BREAKPOINT = 640;

export function QuoteRowActions({
  quoteId,
  status,
  convertedInvoiceId,
  quoteNumber,
  customerName,
}: {
  quoteId: string;
  status: string;
  convertedInvoiceId?: string | null;
  quoteNumber: string;
  customerName?: string | null;
}) {
  const router = useRouter();
  const { showSuccessToast, showErrorToast } = useToasts();
  const [loading, setLoading] = useState(false);
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
  const [mounted, setMounted] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const updateMenuPosition = useCallback(() => {
    const btn = triggerRef.current;
    const panel = panelRef.current;
    if (!btn) return;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    if (vw < MOBILE_BREAKPOINT) return;

    const rect = btn.getBoundingClientRect();
    const pw = Math.max(panel?.offsetWidth ?? MENU_MIN_W, MENU_MIN_W);
    const ph = panel?.offsetHeight ?? 200;

    let top = rect.bottom + MENU_GAP;
    let left = rect.right - pw;
    left = Math.min(Math.max(MENU_GAP, left), vw - pw - MENU_GAP);
    if (top + ph > vh - MENU_GAP) {
      top = Math.max(MENU_GAP, rect.top - ph - MENU_GAP);
    }
    if (top + ph > vh - MENU_GAP) {
      top = Math.max(MENU_GAP, vh - ph - MENU_GAP);
    }
    setMenuPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen || !mounted) return;
    updateMenuPosition();
    const id = window.requestAnimationFrame(() => updateMenuPosition());
    const ro = new ResizeObserver(() => updateMenuPosition());
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      window.cancelAnimationFrame(id);
      ro.disconnect();
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [menuOpen, mounted, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onResize = () => {
      setMobileSheet(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [menuOpen]);

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
      router.refresh();
    } catch (err) {
      showErrorToast('Something went wrong. Please retry');
    } finally {
      setLoading(false);
    }
  }

  async function convertToInvoice() {
    setMenuOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/convert`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not convert quote');
      router.push(`/dashboard/invoices/${data.invoice_id}`);
      router.refresh();
    } catch (err) {
      showErrorToast('Something went wrong. Please retry');
    } finally {
      setLoading(false);
    }
  }

  const s = String(status).toLowerCase();

  const menuContent = (
    <>
      {(s === 'draft' || s === 'sent') ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            disabled={loading}
            onClick={() => {
              setMenuOpen(false);
              setAcceptOpen(true);
            }}
          >
            Mark as accepted
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            disabled={loading}
            onClick={() => {
              setMenuOpen(false);
              setRejectOpen(true);
            }}
          >
            Mark as rejected
          </button>
        </>
      ) : null}

      {s === 'accepted' ? (
        convertedInvoiceId ? (
          <Link
            href={`/dashboard/invoices/${convertedInvoiceId}`}
            className={menuItemClass}
            onClick={closeMenu}
          >
            View Invoice
          </Link>
        ) : (
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            disabled={loading}
            onClick={() => void convertToInvoice()}
          >
            Convert to Invoice
          </button>
        )
      ) : null}

      <button
        type="button"
        className={menuItemClass}
        disabled={loading}
        onClick={() => void duplicateQuote()}
      >
        Duplicate
      </button>
      <button
        type="button"
        className={`${menuItemClass} text-rose-600 dark:text-rose-400`}
        onClick={() => {
          setMenuOpen(false);
          setDeleteOpen(true);
        }}
      >
        Delete
      </button>
    </>
  );

  const portalMenu =
    menuOpen && mounted && typeof document !== 'undefined'
      ? createPortal(
          mobileSheet ? (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-[60] bg-black/40"
                onClick={closeMenu}
              />
              <div
                ref={panelRef}
                role="menu"
                className="fixed inset-x-0 bottom-0 z-[70] max-h-[min(70vh,24rem)] overflow-y-auto rounded-t-2xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg"
              >
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={closeMenu}
                    className="absolute top-2 right-2 rounded p-1 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                  >
                    ✕
                  </button>
                  <div className="px-4 py-3 pr-9">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{quoteNumber}</div>
                    {customerName ? (
                      <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{customerName}</div>
                    ) : null}
                  </div>
                  <div className="border-b border-gray-200 dark:border-gray-700" />
                  {menuContent}
                </div>
              </div>
            </>
          ) : (
            <div
              ref={panelRef}
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-[70] min-w-[160px] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg"
            >
              <div className="relative">
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={closeMenu}
                  className="absolute top-2 right-2 rounded p-1 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                >
                  ✕
                </button>
                <div className="px-4 py-3 pr-9">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{quoteNumber}</div>
                  {customerName ? (
                    <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{customerName}</div>
                  ) : null}
                </div>
                <div className="border-b border-gray-200 dark:border-gray-700" />
                {menuContent}
              </div>
            </div>
          ),
          document.body
        )
      : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        <button
          ref={triggerRef}
          type="button"
          aria-label="More actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          disabled={loading}
          onClick={() =>
            setMenuOpen((prev) => {
              if (!prev) {
                setMobileSheet(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
              }
              return !prev;
            })
          }
          className="app-btn-secondary inline-flex h-9 w-9 shrink-0 items-center justify-center !p-0 text-slate-600 dark:text-slate-300"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </div>

      {portalMenu}

      {acceptOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm dark:bg-black/70"
          onClick={() => !loading && setAcceptOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Mark quote as accepted</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Capture how the confirmation happened.</p>
            </div>
            <div className="max-h-[min(70vh,34rem)] space-y-4 overflow-y-auto px-5 py-4">
              <label className="block">
                <span className={`${labelClass} block`}>How was this confirmed?</span>
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
                <label className="block">
                  <span className={`${labelClass} block`}>Please specify</span>
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

              <label className="block">
                <span className={`${labelClass} block`}>Additional note (optional)</span>
                <textarea
                  value={acceptAdditionalNote}
                  onChange={(e) => setAcceptAdditionalNote(e.target.value)}
                  rows={3}
                  className={inputClass}
                  placeholder="e.g. Pricing confirmed after review"
                />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button type="button" disabled={loading} onClick={() => setAcceptOpen(false)} className={secondaryBtn}>
                Cancel
              </button>
              <button type="button" disabled={loading} onClick={() => void confirmAccept()} className={primaryBtnSm}>
                Confirm acceptance
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm dark:bg-black/70"
          onClick={() => !loading && setRejectOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Mark quote as rejected</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Capture how the rejection was confirmed.</p>
            </div>
            <div className="max-h-[min(70vh,34rem)] space-y-4 overflow-y-auto px-5 py-4">
              <label className="block">
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
                <label className="block">
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

              <label className="block">
                <span className={labelClass}>Additional note (optional)</span>
                <textarea
                  value={rejectAdditionalNote}
                  onChange={(e) => setRejectAdditionalNote(e.target.value)}
                  rows={3}
                  className={inputClass}
                  placeholder="e.g. Customer declined pricing"
                />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button type="button" disabled={loading} onClick={() => setRejectOpen(false)} className={secondaryBtn}>
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void confirmReject()}
                className={destructiveBtnSm}
              >
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60"
          onClick={() => !loading && setDeleteOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete quote?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to delete this quote?
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">This cannot be undone.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={loading} onClick={() => setDeleteOpen(false)} className={secondaryBtn}>
                Cancel
              </button>
              <button type="button" disabled={loading} onClick={() => void deleteQuote()} className={destructiveBtnSm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
