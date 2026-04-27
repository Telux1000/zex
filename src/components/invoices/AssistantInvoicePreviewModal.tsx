'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mapApiInvoiceJsonToEditModeInitialData } from '@/lib/invoices/map-api-invoice-to-edit-initial-data';
import { mapApiInvoiceJsonToPreviewSaved } from '@/lib/invoices/map-api-invoice-to-preview-saved';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileDown, Pencil, RefreshCw, Send, X } from 'lucide-react';
import { useIsLgDown } from '@/hooks/use-is-lg-down';
import type { AssistantInvoicePreviewContext } from '@/components/invoices/assistant-invoice-preview-context';
import ManualInvoiceForm, { type EditModeInitialData } from '@/components/invoices/ManualInvoiceForm';
import { InvoicePreviewSaved } from '@/components/invoices/InvoicePreview';
import { cn } from '@/lib/utils/cn';
import type { InvoicePreviewSavedBundle } from '@/lib/invoices/map-api-invoice-to-preview-saved';
import { loadAssistantInvoicePreviewFromSupabase } from '@/lib/invoices/assistant-invoice-preview-client-load';
import {
  buildAssistantChatOverlayFromBundle,
  type AssistantInvoiceSavedToChatPayload,
} from '@/lib/invoices/assistant-invoice-chat-overlay';
import { canEdit } from '@/lib/invoices/edit-rules';
import { formatDisplayDate } from '@/lib/utils/date';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { SavingOverlay } from '@/components/feedback/SavingOverlay';

function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return String(status).replace(/_/g, ' ');
}

function InvoiceStatusBadge({ status, paidAt }: { status: string; paidAt?: string | null }) {
  const s = String(status ?? 'draft').toLowerCase();
  const baseLabel = formatStatusLabel(status);
  const paidDateLabel =
    s === 'paid' && paidAt && String(paidAt).trim() ? formatDisplayDate(String(paidAt)) : null;
  const label = paidDateLabel ? `${baseLabel} · ${paidDateLabel}` : baseLabel;
  const styles =
    s === 'paid'
      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800/60'
      : s === 'voided'
        ? 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'
        : s === 'refunded' || s === 'partially_refunded'
          ? 'bg-rose-50 text-rose-800 ring-rose-200/80 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800/60'
        : s === 'sent' || s === 'partially_paid' || s === 'partial'
          ? 'bg-indigo-50 text-indigo-800 ring-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-800/60'
          : 'bg-amber-50 text-amber-900 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800/50';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset',
        styles
      )}
    >
      {label}
    </span>
  );
}

function InvoiceLoadingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 py-2 lg:max-w-5xl" aria-hidden>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-4">
          <div className="h-12 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1 space-y-2">
            <div className="ml-auto h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="ml-auto h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
        <div className="mt-6 space-y-3 border-t border-slate-100 pt-6 dark:border-slate-800">
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="mt-6 space-y-2">
          {[1, 2, 3].map((k) => (
            <div key={k} className="flex gap-4">
              <div className="h-3 flex-1 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-sm font-medium text-[var(--foreground)]">Loading invoice…</p>
    </div>
  );
}

type Props = {
  context: AssistantInvoicePreviewContext | null;
  open: boolean;
  onClose: () => void;
  onAssistantFollowUp?: (message: string) => void;
  followUpDisabled?: boolean;
  /** After a successful save from edit mode, so Assistant chat cards can refresh + show “Edited”. */
  onInvoiceSavedToAssistant?: (payload: AssistantInvoiceSavedToChatPayload) => void;
};

export function AssistantInvoicePreviewModal({
  context,
  open,
  onClose,
  onAssistantFollowUp,
  followUpDisabled,
  onInvoiceSavedToAssistant,
}: Props) {
  const router = useRouter();
  const { showErrorToast, showSuccessToast } = useToasts();
  const [previewBundle, setPreviewBundle] = useState<InvoicePreviewSavedBundle | null>(null);
  const [editInitialData, setEditInitialData] = useState<EditModeInitialData | null>(null);
  /** Strict fetch lifecycle: only `success` may render invoice + actions. */
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [workspaceMode, setWorkspaceMode] = useState<'view' | 'edit'>('view');
  const [editEverOpened, setEditEverOpened] = useState(false);
  /** Below `lg`: Edit vs Preview tab while editing (full-screen task flow). */
  const [mobileEditTab, setMobileEditTab] = useState<'edit' | 'preview'>('edit');
  const [sendConfirmKind, setSendConfirmKind] = useState<'send_now' | 'send_reminder' | null>(null);
  const [sendProcessing, setSendProcessing] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** `ManualInvoiceForm` submit in flight (drives mobile Save in workspace header). */
  const [formSubmitting, setFormSubmitting] = useState(false);
  /** Only auto-enter edit from `context.initialMode` once per open / invoice (not after save reload). */
  const shouldApplyInitialEditRef = useRef(false);
  const previewBundleRef = useRef<InvoicePreviewSavedBundle | null>(null);

  const isMobile = useIsLgDown();

  /** False only while the embedded editor’s mobile “Preview” tab is shown but not yet laid out (see ManualInvoiceForm callback). */
  const [embedMobilePreviewReady, setEmbedMobilePreviewReady] = useState(true);
  const handleMobileEmbedPreviewPainted = useCallback(() => {
    setEmbedMobilePreviewReady(true);
  }, []);

  useLayoutEffect(() => {
    if (workspaceMode !== 'edit' || !isMobile) {
      setEmbedMobilePreviewReady(true);
      return;
    }
    if (mobileEditTab !== 'preview') {
      setEmbedMobilePreviewReady(true);
      return;
    }
    setEmbedMobilePreviewReady(false);
  }, [mobileEditTab, workspaceMode, isMobile]);

  const showMobileEditPreviewNavOverlay =
    isMobile && workspaceMode === 'edit' && mobileEditTab === 'preview' && !embedMobilePreviewReady;

  const invoiceId = (() => {
    const v = context?.invoiceId;
    if (v == null) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  })();

  const isLoading = loadStatus === 'loading';
  const isSuccess = loadStatus === 'success' && previewBundle !== null;
  const isError = loadStatus === 'error';

  previewBundleRef.current = previewBundle;

  useEffect(() => {
    if (!open || !invoiceId) {
      setLoadStatus('idle');
      setPreviewBundle(null);
      setEditInitialData(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadStatus('loading');
      setPreviewBundle(null);
      setEditInitialData(null);
      try {
        const result = await loadAssistantInvoicePreviewFromSupabase(invoiceId);
        if (cancelled) return;
        if (!result.ok) {
          setLoadStatus('error');
          return;
        }
        setPreviewBundle(result.bundle);
        setEditInitialData(result.editInitialData);
        setLoadStatus('success');
      } catch {
        if (!cancelled) setLoadStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId]);

  useEffect(() => {
    if (!open || !invoiceId) {
      shouldApplyInitialEditRef.current = false;
      return;
    }
    shouldApplyInitialEditRef.current = true;
  }, [open, invoiceId]);

  useEffect(() => {
    if (!open) return;
    setWorkspaceMode('view');
    setEditEverOpened(false);
    setMobileEditTab('edit');
  }, [open, invoiceId]);

  useEffect(() => {
    if (workspaceMode === 'edit') setMobileEditTab('edit');
  }, [workspaceMode]);

  useEffect(() => {
    if (!open || loadStatus !== 'success' || !previewBundle || !editInitialData || !invoiceId) return;
    if (!shouldApplyInitialEditRef.current) return;
    if (context?.initialMode !== 'edit') {
      shouldApplyInitialEditRef.current = false;
      return;
    }
    if (!canEdit(previewBundle.invoice.status)) {
      shouldApplyInitialEditRef.current = false;
      return;
    }
    setWorkspaceMode('edit');
    setEditEverOpened(true);
    shouldApplyInitialEditRef.current = false;
  }, [open, loadStatus, previewBundle, editInitialData, invoiceId, context?.initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || workspaceMode === 'view') {
      setFormSubmitting(false);
    }
  }, [open, workspaceMode]);

  const hrefInvoice = `/dashboard/invoices/${invoiceId ?? ''}`;

  const handleOpenInInvoices = () => {
    onClose();
    router.push(hrefInvoice);
  };

  const refreshPreviewBundle = useCallback(async (opts?: { emitEditedAtMs?: number }) => {
    if (!invoiceId) return;
    try {
      const result = await loadAssistantInvoicePreviewFromSupabase(invoiceId);
      if (result.ok) {
        setPreviewBundle(result.bundle);
        setEditInitialData(result.editInitialData);
        const overlay = buildAssistantChatOverlayFromBundle(
          result.bundle,
          opts?.emitEditedAtMs ?? Date.now()
        );
        onInvoiceSavedToAssistant?.({
          invoiceId,
          ...overlay,
          ...(opts?.emitEditedAtMs == null ? { editedAtMs: undefined } : {}),
        });
      }
    } catch {
      /* keep existing data */
    }
  }, [invoiceId, onInvoiceSavedToAssistant]);

  const reloadAfterSave = useCallback(
    async (payload?: { invoiceId: string; data?: unknown }) => {
      const raw = payload?.data as Record<string, unknown> | undefined;
      if (raw && invoiceId) {
        const next = mapApiInvoiceJsonToPreviewSaved(raw);
        if (next) {
          const prev = previewBundleRef.current;
          const merged =
            prev &&
            (next.business.name === 'Business' || !String(next.business.name ?? '').trim()) &&
            String(prev.business.name ?? '').trim() &&
            prev.business.name !== 'Business'
              ? { ...next, business: prev.business }
              : next;
          setPreviewBundle(merged);
          const nextEdit = mapApiInvoiceJsonToEditModeInitialData(raw);
          if (nextEdit) setEditInitialData(nextEdit);
          onInvoiceSavedToAssistant?.({
            invoiceId,
            ...buildAssistantChatOverlayFromBundle(merged, Date.now()),
          });
          void loadAssistantInvoicePreviewFromSupabase(invoiceId).then((r) => {
            if (r.ok) {
              setPreviewBundle(r.bundle);
              if (r.editInitialData) setEditInitialData(r.editInitialData);
            }
          });
        } else {
          await refreshPreviewBundle({ emitEditedAtMs: Date.now() });
        }
      } else if (invoiceId) {
        await refreshPreviewBundle({ emitEditedAtMs: Date.now() });
      }
      setWorkspaceMode('view');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          showSuccessToast('Invoice saved');
        });
      });
    },
    [invoiceId, refreshPreviewBundle, onInvoiceSavedToAssistant, showSuccessToast]
  );

  const normalizedStatus = String(previewBundle?.invoice.status ?? '').toLowerCase();
  const balanceDue = Number((previewBundle?.invoice as { balance_due?: number | null } | null)?.balance_due ?? 0);
  const hasOutstandingBalance = Number.isFinite(balanceDue) && balanceDue > 0.02;
  const sentBefore = ['sent', 'viewed', 'overdue', 'partially_paid', 'paid'].includes(normalizedStatus);
  const sendBlocked = ['paid', 'cancelled', 'voided'].includes(normalizedStatus);
  const canSendNow = isSuccess && !sendBlocked && !sentBefore;
  const canSendReminder = isSuccess && !sendBlocked && sentBefore && hasOutstandingBalance;
  const sendActionKind: 'send_now' | 'send_reminder' | null = canSendNow
    ? 'send_now'
    : canSendReminder
      ? 'send_reminder'
      : null;
  const sendActionLabel =
    sendActionKind === 'send_now'
      ? 'Send now'
      : sendActionKind === 'send_reminder'
        ? 'Send reminder'
        : null;
  const sendLoadingLabel =
    sendActionKind === 'send_now' ? 'Sending invoice…' : 'Sending reminder…';

  const workspaceFormId =
    invoiceId != null
      ? `assistant-invoice-workspace-form-${String(invoiceId).replace(/[^a-zA-Z0-9_-]/g, '')}`
      : undefined;

  const handleMobileBackFromEdit = useCallback(() => {
    setWorkspaceMode('view');
    setMobileEditTab('edit');
  }, []);

  const handleConfirmSend = useCallback(async () => {
    if (!invoiceId || !sendConfirmKind || sendProcessing) return;
    setSendError(null);
    setSendProcessing(true);
    try {
      if (sendConfirmKind === 'send_now') {
        const res = await fetch('/api/stripe/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice_id: invoiceId, mode: 'send_invoice' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not send invoice');
        showSuccessToast('Invoice sent');
      } else {
        const res = await fetch(`/api/invoices/${invoiceId}/send-reminder`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not send reminder');
        if ((data as { skipped?: boolean }).skipped) {
          showSuccessToast('Nothing to send (already paid)');
        } else {
          showSuccessToast('Reminder sent');
        }
      }
      await refreshPreviewBundle();
      setSendConfirmKind(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Send failed';
      setSendError(msg);
      showErrorToast(msg);
    } finally {
      setSendProcessing(false);
    }
  }, [invoiceId, sendConfirmKind, sendProcessing, refreshPreviewBundle, showErrorToast, showSuccessToast]);

  if (!open || !context || !invoiceId) return null;

  const invNumDisplay =
    isSuccess && previewBundle ? previewBundle.invoice.invoice_number?.trim() || '—' : '—';
  const statusDisplay = isSuccess && previewBundle ? previewBundle.invoice.status : 'draft';
  const statusPaidAtDisplay = isSuccess && previewBundle ? previewBundle.invoice.paid_at ?? null : null;
  const editable = isSuccess && previewBundle ? canEdit(previewBundle.invoice.status) : false;
  const pdfHref = `/api/invoices/${invoiceId}/pdf`;

  const headingId =
    workspaceMode === 'edit' ? 'assistant-invoice-workspace-edit-heading' : 'assistant-invoice-preview-heading';
  const workspaceSubtitle = workspaceMode === 'edit' ? 'Edit invoice' : 'Invoice preview';

  return (
    <div
      className={cn(
        'fixed inset-0 z-[110]',
        isMobile
          ? 'flex flex-col bg-[var(--card)]'
          : 'flex items-end justify-center bg-black/50 p-0 lg:items-center lg:p-6'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-busy={isLoading || showMobileEditPreviewNavOverlay}
    >
      {!isMobile ? (
        <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      ) : null}
      <div
        className={cn(
          'relative z-10 flex w-full flex-col overflow-hidden bg-[var(--card)] shadow-2xl',
          'h-[100dvh] max-h-[100dvh] min-h-0 flex-1 rounded-none',
          !isMobile &&
            'border border-[var(--card-border)] lg:h-[min(92dvh,980px)] lg:max-h-[min(92dvh,980px)] lg:min-h-[min(560px,72dvh)] lg:w-[min(92rem,calc(100vw-2rem))] lg:rounded-2xl dark:border-slate-600 dark:bg-slate-900'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile: full-screen chrome; Desktop: existing gradient header */}
        {isMobile && workspaceMode === 'view' ? (
          <div className="flex shrink-0 items-center gap-3 border-b border-[var(--card-border)] bg-[var(--card)] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] transition hover:bg-[var(--background)]"
              aria-label="Back to assistant"
            >
              <ArrowLeft className="h-6 w-6" strokeWidth={2} />
            </button>
            <div className="min-w-0 flex-1">
              <p id={headingId} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Invoice
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--foreground)]">
                  {isSuccess ? invNumDisplay : isLoading ? 'Loading…' : '—'}
                </h2>
                {isSuccess ? <InvoiceStatusBadge status={statusDisplay} paidAt={statusPaidAtDisplay} /> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenInInvoices}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
              aria-label="Open in Invoices"
            >
              <ExternalLink className="h-5 w-5 opacity-80" />
            </button>
          </div>
        ) : isMobile && workspaceMode === 'edit' ? (
          <div className="flex shrink-0 flex-col border-b border-[var(--card-border)] bg-[var(--card)] dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={handleMobileBackFromEdit}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] transition hover:bg-[var(--background)]"
                aria-label="Back to invoice preview"
              >
                <ArrowLeft className="h-6 w-6" strokeWidth={2} />
              </button>
              <h2 id={headingId} className="min-w-0 flex-1 text-center text-base font-semibold text-[var(--foreground)]">
                Edit invoice
              </h2>
              {workspaceFormId ? (
                <button
                  type="submit"
                  form={workspaceFormId}
                  disabled={!editInitialData || loadStatus !== 'success' || formSubmitting}
                  className="shrink-0 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-indigo-500"
                  aria-busy={formSubmitting}
                >
                  {formSubmitting ? 'Saving…' : 'Save'}
                </button>
              ) : (
                <div className="w-10" aria-hidden />
              )}
            </div>
            <div className="flex px-2 pb-2">
              <div className="flex w-full rounded-xl bg-slate-100/90 p-1 dark:bg-slate-800/90">
                <button
                  type="button"
                  onClick={() => setMobileEditTab('edit')}
                  className={cn(
                    'flex-1 rounded-lg py-2.5 text-sm font-semibold transition',
                    mobileEditTab === 'edit'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  )}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setMobileEditTab('preview')}
                  className={cn(
                    'flex-1 rounded-lg py-2.5 text-sm font-semibold transition',
                    mobileEditTab === 'preview'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  )}
                >
                  Preview
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--card-border)] bg-gradient-to-b from-slate-50/95 to-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-6 dark:from-slate-900 dark:to-slate-900/95">
            <div className="min-w-0 flex-1">
              <p
                id={headingId}
                className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
              >
                {workspaceSubtitle}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 gap-y-2">
                <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)] lg:text-2xl">
                  {isSuccess ? invNumDisplay : isLoading ? 'Loading…' : '—'}
                </h2>
                {isSuccess ? <InvoiceStatusBadge status={statusDisplay} paidAt={statusPaidAtDisplay} /> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 self-end lg:self-center">
              <button
                type="button"
                onClick={handleOpenInInvoices}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--card-border)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--foreground)] shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <ExternalLink className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Open in Invoices
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        {workspaceMode === 'view' ? (
          <>
            <div
              className={cn(
                'min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-slate-100/80 px-3 py-4 dark:bg-slate-950/80 lg:px-8 lg:py-6',
                isMobile && 'px-4'
              )}
            >
              {isLoading ? (
                <InvoiceLoadingSkeleton />
              ) : isError ? (
                <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center shadow-sm">
                  <p className="text-sm leading-relaxed text-[var(--foreground)]">We couldn&apos;t load this invoice.</p>
                </div>
              ) : isSuccess && previewBundle ? (
                <div className="mx-auto w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl">
                  <div className="overflow-hidden rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/90 dark:shadow-none dark:ring-slate-700">
                    <InvoicePreviewSaved
                      source="saved"
                      data={{
                        business: previewBundle.business,
                        invoice: previewBundle.invoice,
                        items: previewBundle.items,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {isError ? (
              <div className="shrink-0 border-t border-[var(--card-border)] bg-[var(--card)] px-4 py-3 dark:bg-slate-900 lg:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!invoiceId) return;
                      setLoadStatus('loading');
                      setPreviewBundle(null);
                      setEditInitialData(null);
                      void (async () => {
                        try {
                          const result = await loadAssistantInvoicePreviewFromSupabase(invoiceId);
                          if (!result.ok) {
                            setLoadStatus('error');
                            return;
                          }
                          setPreviewBundle(result.bundle);
                          setEditInitialData(result.editInitialData);
                          setLoadStatus('success');
                        } catch {
                          setLoadStatus('error');
                        }
                      })();
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card)] sm:flex-initial sm:min-w-[10rem]"
                  >
                    <RefreshCw className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenInInvoices}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 sm:flex-initial sm:min-w-[10rem]"
                  >
                    Open in Invoices
                  </button>
                </div>
              </div>
            ) : isSuccess ? (
              <div
                className={cn(
                  'shrink-0 border-t border-[var(--card-border)] bg-[var(--card)] dark:bg-slate-900',
                  isMobile
                    ? 'px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2'
                    : 'px-4 py-3 lg:px-6'
                )}
              >
                {isMobile ? (
                  <nav
                    className="flex max-w-full flex-nowrap items-center justify-between gap-2"
                    aria-label="Invoice actions"
                  >
                    <button
                      type="button"
                      disabled={!editable || !editInitialData}
                      onClick={() => {
                        if (!editable || !editInitialData) return;
                        setEditEverOpened(true);
                        setWorkspaceMode('edit');
                      }}
                      aria-label="Edit invoice"
                      title="Edit invoice"
                      className="flex min-h-[60px] min-w-0 flex-1 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-1 py-2 text-slate-800 transition active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:active:bg-slate-700"
                    >
                      <Pencil className="h-6 w-6 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-[11px] font-semibold leading-none tracking-wide text-slate-600 dark:text-slate-300">
                        Edit
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={
                        followUpDisabled ||
                        sendActionKind == null ||
                        sendProcessing ||
                        Boolean(sendConfirmKind)
                      }
                      onClick={() => {
                        if (sendActionKind) {
                          setSendError(null);
                          setSendConfirmKind(sendActionKind);
                        }
                      }}
                      aria-label="Send invoice"
                      title="Send invoice"
                      className="flex min-h-[60px] min-w-0 flex-1 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-indigo-200/80 bg-indigo-50/95 px-1 py-2 text-indigo-800 transition active:bg-indigo-100/90 disabled:cursor-not-allowed disabled:opacity-40 dark:border-indigo-800/80 dark:bg-indigo-950/60 dark:text-indigo-100 dark:active:bg-indigo-900/70"
                    >
                      <Send className="h-6 w-6 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-[11px] font-semibold leading-none tracking-wide text-indigo-700 dark:text-indigo-200">
                        {sendProcessing ? sendLoadingLabel : sendActionLabel ?? 'Send'}
                      </span>
                    </button>
                    <a
                      href={pdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Download PDF"
                      title="Download PDF"
                      className="flex min-h-[60px] min-w-0 flex-1 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200/90 bg-white px-1 py-2 text-slate-800 transition active:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-slate-700"
                    >
                      <FileDown className="h-6 w-6 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="text-[11px] font-semibold leading-none tracking-wide text-slate-600 dark:text-slate-300">
                        PDF
                      </span>
                    </a>
                  </nav>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <button
                      type="button"
                      disabled={!editable || !editInitialData}
                      onClick={() => {
                        if (!editable || !editInitialData) return;
                        setEditEverOpened(true);
                        setWorkspaceMode('edit');
                      }}
                      className="inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-center text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card)] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial"
                    >
                      <Pencil className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      Edit invoice
                    </button>
                    <button
                      type="button"
                      disabled={
                        followUpDisabled ||
                        sendActionKind == null ||
                        sendProcessing ||
                        Boolean(sendConfirmKind)
                      }
                      onClick={() => {
                        if (sendActionKind) {
                          setSendError(null);
                          setSendConfirmKind(sendActionKind);
                        }
                      }}
                      className="inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-xl border border-indigo-200/90 bg-indigo-50/90 px-3 py-2.5 text-center text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100/90 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/70 sm:flex-initial"
                    >
                      <Send className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      {sendProcessing ? sendLoadingLabel : sendActionLabel ?? 'Send'}
                    </button>
                    <a
                      href={pdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-center text-sm font-semibold text-[var(--foreground)] shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 sm:flex-initial"
                    >
                      <FileDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      Download PDF
                    </a>
                  </div>
                )}
              </div>
            ) : null}
            {isSuccess && sendError ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-300">{sendError}</p>
            ) : null}
          </>
        ) : (
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-slate-100/80 px-3 py-3 dark:bg-slate-950/80 lg:px-6 lg:py-4',
              isMobile && 'px-4 py-2 pb-[max(1rem,env(safe-area-inset-bottom))]'
            )}
          >
            {editEverOpened && editInitialData ? (
              <ManualInvoiceForm
                key={invoiceId}
                invoiceId={invoiceId}
                initialData={editInitialData}
                mode="edit"
                editInvoiceNumber={previewBundle?.invoice.invoice_number?.trim() ?? null}
                workspaceEmbed
                onWorkspaceBack={() => setWorkspaceMode('view')}
                onSubmittingChange={setFormSubmitting}
                onSaved={async (p) => {
                  await reloadAfterSave(p);
                }}
                workspaceMobilePanel={
                  isMobile ? (mobileEditTab === 'edit' ? 'form' : 'preview') : undefined
                }
                htmlFormId={workspaceFormId}
                workspaceMobileSuppressFooter={isMobile}
                onWorkspaceMobilePreviewPainted={handleMobileEmbedPreviewPainted}
              />
            ) : editEverOpened ? (
              <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <p className="text-sm text-[var(--foreground)]">Editor data isn&apos;t available for this invoice.</p>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode('view')}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  Back to preview
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <SavingOverlay
        active={showMobileEditPreviewNavOverlay}
        message="Loading invoice preview…"
        delayMs={400}
        className="!z-[220]"
      />
      {sendConfirmKind && isSuccess ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-2xl">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {sendConfirmKind === 'send_now'
                ? `Send invoice ${previewBundle?.invoice.invoice_number || 'this invoice'} to ${previewBundle?.invoice.customer_name || 'this customer'} now?`
                : `Send a payment reminder for ${previewBundle?.invoice.invoice_number || 'this invoice'} to ${previewBundle?.invoice.customer_name || 'this customer'}?`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={sendProcessing}
                onClick={() => setSendConfirmKind(null)}
                className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendProcessing}
                onClick={() => void handleConfirmSend()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {sendProcessing
                  ? sendConfirmKind === 'send_now'
                    ? 'Sending invoice...'
                    : 'Sending reminder...'
                  : sendConfirmKind === 'send_now'
                    ? 'Confirm send'
                    : 'Confirm reminder'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
