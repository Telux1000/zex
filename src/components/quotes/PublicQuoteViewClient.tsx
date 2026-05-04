'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { QuoteDocumentPreview } from '@/components/quotes/QuoteDocumentPreview';
import { formatDisplayDate } from '@/lib/utils/date';

type PublicQuote = {
  id: string;
  quote_number: string;
  issue_date: string;
  expiry_date: string | null;
  status: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  customer_snapshot: Record<string, unknown> | null;
  accepted_at?: string | null;
  accepted_via?: string | null;
  accepted_note?: string | null;
  rejected_at?: string | null;
  rejected_via?: string | null;
  rejection_reason?: string | null;
  confirmation_channel?: 'email' | 'phone' | 'in_person' | null;
  converted_invoice_id?: string | null;
  invoicePublicToken?: string | null;
  business: Record<string, unknown> | null;
  items: Array<Record<string, unknown>>;
};

function mergeQuotePreservingInvoiceToken(prev: PublicQuote, incoming: PublicQuote): PublicQuote {
  const merged: PublicQuote = { ...prev, ...incoming };
  const invId = String(merged.converted_invoice_id ?? '').trim();
  const mergedTok = String(merged.invoicePublicToken ?? '').trim();
  const prevTok = String(prev.invoicePublicToken ?? '').trim();
  if (invId && prevTok && !mergedTok) {
    merged.invoicePublicToken = prevTok;
  }
  return merged;
}

export function PublicQuoteViewClient({ token, initialQuote }: { token: string; initialQuote: PublicQuote }) {
  const [quote, setQuote] = useState(initialQuote);
  const [loading, setLoading] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptNote, setAcceptNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAccepted = useMemo(() => {
    const st = String(quote.status ?? '').trim().toLowerCase();
    return st === 'accepted_customer' || st === 'accepted' || st === 'accepted_manual';
  }, [quote.status]);
  const isRejected = useMemo(() => {
    const st = String(quote.status ?? '').trim().toLowerCase();
    return st === 'rejected_customer' || st === 'rejected' || st === 'rejected_manual';
  }, [quote.status]);
  const isExpired = useMemo(() => String(quote.status ?? '').trim().toLowerCase() === 'expired', [quote.status]);
  const actionLocked = useMemo(
    () => String(quote.status ?? '').trim().toLowerCase() !== 'sent' || isExpired || isAccepted || isRejected,
    [quote.status, isExpired, isAccepted, isRejected]
  );
  const channelLabel = useMemo(() => {
    if (quote.confirmation_channel === 'email') return 'email';
    if (quote.confirmation_channel === 'phone') return 'phone call';
    if (quote.confirmation_channel === 'in_person') return 'in person';
    return null;
  }, [quote.confirmation_channel]);

  const refreshQuote = useCallback(async () => {
    const res = await fetch(`/api/quote/public/${token}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const data = await res.json();
    if (res.ok && data?.quote) {
      setQuote((prev) => mergeQuotePreservingInvoiceToken(prev, data.quote as PublicQuote));
    }
  }, [token]);

  const invoiceLinkRefetchOnce = useRef(false);
  useEffect(() => {
    const st = String(quote.status ?? '').trim().toLowerCase();
    const accepted =
      st === 'accepted_customer' || st === 'accepted' || st === 'accepted_manual';
    const invId = String(quote.converted_invoice_id ?? '').trim();
    const hasTok = Boolean(String(quote.invoicePublicToken ?? '').trim());
    if (!accepted || !invId || hasTok || invoiceLinkRefetchOnce.current) return;
    invoiceLinkRefetchOnce.current = true;
    void refreshQuote();
  }, [quote.status, quote.converted_invoice_id, quote.invoicePublicToken, refreshQuote]);

  const showViewInvoice =
    isAccepted && Boolean(String(quote.invoicePublicToken ?? '').trim());

  async function acceptQuote() {
    if (loading || actionLocked) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/quote/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', note: acceptNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        await refreshQuote();
        throw new Error(data?.error ?? 'Could not accept quote');
      }
      setAcceptOpen(false);
      if (data?.alreadyActioned) {
        setMessage('This quote has already been accepted.');
      } else if (data?.status === 'expired') {
        setMessage('This quote has expired and can no longer be actioned.');
      } else {
        setMessage(
          data?.auto_sent
            ? 'Quote accepted. Invoice created and auto-sent.'
            : 'Quote accepted. Invoice created.'
        );
      }
      const invId = data?.invoice_id ?? data?.invoiceId;
      const invTok = data?.invoicePublicToken;
      if (invId && invTok) {
        const acceptedNow = new Date().toISOString();
        setQuote((prev) => ({
          ...prev,
          status: 'accepted_customer',
          accepted_at: prev.accepted_at ?? acceptedNow,
          converted_invoice_id: String(invId),
          invoicePublicToken: String(invTok),
        }));
      }
      await refreshQuote();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept quote');
    } finally {
      setLoading(false);
    }
  }

  async function rejectQuote() {
    if (loading || actionLocked) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/quote/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        await refreshQuote();
        throw new Error(data?.error ?? 'Could not reject quote');
      }
      setRejectOpen(false);
      if (data?.alreadyActioned) {
        setMessage('This quote has already been declined.');
      } else if (data?.status === 'expired') {
        setMessage('This quote has expired and can no longer be actioned.');
      } else {
        setMessage('Quote rejected successfully');
      }
      await refreshQuote();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reject quote');
    } finally {
      setLoading(false);
    }
  }

  const business = (quote.business ?? {}) as Record<string, unknown>;
  const isFinalState = isAccepted || isRejected;
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      {!isFinalState ? (
        <div className="mb-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <h1 className="text-xl font-semibold">Quote</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Review and confirm quote {quote.quote_number}</p>
        </div>
      ) : null}

      {message ? <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="mt-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        {isAccepted ? (
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold">Quote Accepted</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {message && !message.toLowerCase().includes('already')
                ? 'This quote has been accepted successfully.'
                : 'This quote has already been accepted.'}
            </p>
            {(quote.accepted_at || channelLabel) ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {[quote.accepted_at ? formatDisplayDate(quote.accepted_at) : null, channelLabel]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
            {showViewInvoice ? (
              <Link
                href={`/invoice/view/${encodeURIComponent(String(quote.invoicePublicToken ?? '').trim())}`}
                className="app-btn-primary mt-4"
              >
                View Invoice
              </Link>
            ) : null}
          </div>
        ) : isRejected ? (
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <XCircle className="h-12 w-12 text-rose-600" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold">Quote Declined</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {message && !message.toLowerCase().includes('already')
                ? 'This quote has been declined.'
                : 'This quote has already been declined.'}
            </p>
            {(quote.rejected_at || channelLabel) ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {[quote.rejected_at ? formatDisplayDate(quote.rejected_at) : null, channelLabel]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
          </div>
        ) : isExpired ? (
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <XCircle className="h-12 w-12 text-amber-600" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold">Quote Expired</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              This quote expired{quote.expiry_date ? ` on ${formatDisplayDate(quote.expiry_date)}.` : '.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={loading || actionLocked}
              onClick={() => setRejectOpen(true)}
              className="app-btn-destructive inline-flex items-center justify-center disabled:opacity-60"
            >
              Reject Quote
            </button>
            <button
              type="button"
              disabled={loading || actionLocked}
              onClick={() => setAcceptOpen(true)}
              className="app-btn-primary disabled:opacity-60"
            >
              Accept Quote
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <QuoteDocumentPreview
          issuer={{
            name: String(business.name ?? 'Business'),
            logo_url: (business.logo_url as string | null) ?? null,
            email: (business.email as string | null) ?? null,
            phone: (business.phone as string | null) ?? null,
            tax_id: (business.tax_id as string | null) ?? null,
            address_line1: (business.address_line1 as string | null) ?? null,
            address_line2: (business.address_line2 as string | null) ?? null,
            city: (business.city as string | null) ?? null,
            state: (business.state as string | null) ?? null,
            postal_code: (business.postal_code as string | null) ?? null,
            country: (business.country as string | null) ?? null,
          }}
          quoteNumber={quote.quote_number}
          issueDate={quote.issue_date}
          expiryDate={quote.expiry_date}
          currency={quote.currency}
          status={quote.status}
          customerSnapshot={(quote.customer_snapshot as any) ?? null}
          items={(quote.items as any[]).map((i) => ({
            name: String(i.name ?? ''),
            description: (i.description as string | null) ?? null,
            quantity: Number(i.quantity ?? 0),
            unit_price: Number(i.unit_price ?? 0),
            amount: Number(i.amount ?? 0),
            tax_percent: Number(i.tax_percent ?? 0),
          }))}
          subtotal={Number(quote.subtotal ?? 0)}
          tax={Number(quote.tax_amount ?? 0)}
          total={Number(quote.total ?? 0)}
          notes={quote.notes}
          acceptedAt={quote.accepted_at ?? null}
          acceptedVia={quote.accepted_via ?? null}
          acceptedNote={quote.accepted_note ?? null}
          rejectedAt={quote.rejected_at ?? null}
          rejectedVia={quote.rejected_via ?? null}
          rejectionReason={quote.rejection_reason ?? null}
          confirmationChannel={quote.confirmation_channel ?? null}
        />
      </div>

      {acceptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60" onClick={() => !loading && setAcceptOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Accept Quote</h2>
            <p className="mt-3 text-sm text-[var(--muted)]">Quote number</p>
            <p className="mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold tracking-wide">
              {quote.quote_number}
            </p>
            <label className="mt-4 block text-sm text-[var(--muted)]">
              Note (optional)
              <textarea
                rows={4}
                value={acceptNote}
                onChange={(e) => setAcceptNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="app-btn-secondary" onClick={() => setAcceptOpen(false)} disabled={loading}>Cancel</button>
              <button type="button" className="app-btn-primary" onClick={() => void acceptQuote()} disabled={loading}>Accept Quote</button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60" onClick={() => !loading && setRejectOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Reject Quote</h2>
            <p className="mt-3 text-sm text-[var(--muted)]">Quote number</p>
            <p className="mt-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold tracking-wide">
              {quote.quote_number}
            </p>
            <label className="mt-4 block text-sm text-[var(--muted)]">
              Reason
              <textarea
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="app-btn-secondary" onClick={() => setRejectOpen(false)} disabled={loading}>Cancel</button>
              <button
                type="button"
                className="app-btn-destructive inline-flex items-center justify-center disabled:opacity-60"
                onClick={() => void rejectQuote()}
                disabled={loading || !rejectReason.trim()}
              >
                Reject Quote
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
