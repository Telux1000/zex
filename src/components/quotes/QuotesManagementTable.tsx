'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { formatDisplayDate } from '@/lib/utils/date';
import { QuoteRowActions } from '@/components/quotes/QuoteRowActions';
import { getConfirmationMethodSubtextFromVia, isManualConfirmationVia } from '@/lib/quotes/confirmation-method';

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'accepted_customer' | 'rejected_customer';

type QuotesRow = {
  id: string;
  quote_number: string;
  customer_snapshot: { name?: string; email?: string | null } | null;
  issue_date: string;
  expiry_date: string | null;
  status: QuoteStatus | string | null;
  total: number | null;
  currency: string | null;
  accepted_via?: string | null;
  rejected_via?: string | null;
  accepted_note?: string | null;
  rejection_reason?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  confirmation_channel?: 'email' | 'phone' | 'in_person' | string | null;
  converted_invoice_id?: string | null;
  converted_invoice_number?: string | null;
};

function formatConfirmationChannel(channel: string | null): string | null {
  if (!channel) return null;
  const c = channel.trim().toLowerCase();
  if (!c || c === 'manual') return null;
  if (c === 'email') return 'Via email';
  if (c === 'phone') return 'Via phone call';
  if (c === 'in_person') return 'Via in person';
  return null;
}

function deriveConfirmationLine(
  status: string,
  rawChannel: string | null,
  acceptedVia: string | null,
  rejectedVia: string | null
): string | null {
  const explicit = rawChannel?.trim().toLowerCase() ?? '';
  if (explicit === 'email' || explicit === 'phone' || explicit === 'in_person') {
    return formatConfirmationChannel(explicit);
  }
  if (status === 'accepted_customer' || status === 'rejected_customer') return 'Via email';
  const via = status === 'accepted' ? acceptedVia : status === 'rejected' ? rejectedVia : null;
  const methodLine = getConfirmationMethodSubtextFromVia(via);
  if (methodLine?.trim()) return methodLine.trim();
  return null;
}

const searchInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white';

const selectInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white';

export default function QuotesManagementTable({
  quotes,
  businessCurrency,
}: {
  quotes: QuotesRow[];
  businessCurrency: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [statusFilter, setStatusFilter] = useState<'all' | QuoteStatus>('all');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    expired: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    accepted_customer: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    rejected_customer: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  };

  const filteredQuotes = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return (quotes ?? []).filter((q) => {
      const st = String(q.status ?? '').toLowerCase();
      const statusOk = statusFilter === 'all' ? true : st === statusFilter;
      if (!statusOk) return false;

      if (!term) return true;
      const quoteNumber = String(q.quote_number ?? '').toLowerCase();
      const customerName = String(q.customer_snapshot?.name ?? '').toLowerCase();
      const customerEmail = String(q.customer_snapshot?.email ?? '').toLowerCase();
      return quoteNumber.includes(term) || customerName.includes(term) || (customerEmail ? customerEmail.includes(term) : false);
    });
  }, [quotes, debouncedSearch, statusFilter]);

  const isFiltering = statusFilter !== 'all' || search.trim().length > 0;

  return (
    <>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-lg">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotes, customers, quote numbers..."
              className={searchInputClass}
            />
            {isFiltering ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setDebouncedSearch('');
                  setStatusFilter('all');
                }}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="w-full sm:max-w-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | QuoteStatus)}
            className={`${selectInputClass} appearance-none`}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="accepted_customer">Accepted (Customer)</option>
            <option value="rejected_customer">Rejected (Customer)</option>
          </select>
        </div>
      </div>

      <div className="md:hidden">
        {filteredQuotes.length === 0 ? (
          <div className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
            <div className="text-sm font-medium">No quotes found</div>
            <div className="mt-1 text-sm">Try adjusting your search or filter.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-4 pb-3">
            {filteredQuotes.map((quote) => {
              const snapshot = (quote.customer_snapshot as { name?: string } | null) ?? {};
              const st = String(quote.status ?? '').toLowerCase();
              const baseLabel = st ? `${st.charAt(0).toUpperCase()}${st.slice(1)}` : 'Draft';
              const acceptedVia = (quote.accepted_via ?? null) as string | null;
              const rejectedVia = (quote.rejected_via ?? null) as string | null;
              const sourceLine = deriveConfirmationLine(
                st,
                String(quote.confirmation_channel ?? '').trim() || null,
                acceptedVia,
                rejectedVia
              );
              const statusDate =
                st === 'accepted' || st === 'accepted_customer'
                  ? (quote.accepted_at ? formatDisplayDate(String(quote.accepted_at)) : null)
                  : st === 'rejected' || st === 'rejected_customer'
                    ? (quote.rejected_at ? formatDisplayDate(String(quote.rejected_at)) : null)
                    : null;
              const statusLabel =
                st === 'accepted'
                  ? isManualConfirmationVia(acceptedVia)
                    ? 'Accepted (manual)'
                    : 'Accepted'
                  : st === 'accepted_customer'
                    ? 'Accepted (customer)'
                  : st === 'rejected'
                    ? isManualConfirmationVia(rejectedVia)
                      ? 'Rejected (manual)'
                      : 'Rejected'
                    : st === 'rejected_customer'
                      ? 'Rejected (customer)'
                    : baseLabel;
              const sourceSubtext = sourceLine
                ? `${sourceLine}${statusDate ? ` · ${statusDate}` : ''}`
                : null;
              const additionalNote =
                st === 'accepted' || st === 'accepted_customer'
                  ? (quote.accepted_note?.trim() ? String(quote.accepted_note).trim() : null)
                  : st === 'rejected' || st === 'rejected_customer'
                    ? (quote.rejection_reason?.trim() ? String(quote.rejection_reason).trim() : null)
                    : null;

              const issueText = quote.issue_date ? formatDisplayDate(String(quote.issue_date)) : '—';
              const expiresText = quote.expiry_date ? formatDisplayDate(String(quote.expiry_date)) : '—';

              return (
                <button
                  key={quote.id}
                  type="button"
                  onClick={() => router.push(`/dashboard/quotes/${quote.id}`)}
                  className="w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3 text-left dark:border-gray-800 dark:bg-gray-900"
                  aria-label={`Open quote ${quote.quote_number}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {quote.quote_number}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs ${statusColors[st] ?? statusColors.draft}`}>
                        {statusLabel}
                      </span>
                      {sourceSubtext ? (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sourceSubtext}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                    {snapshot.name ?? 'Customer'}
                  </div>

                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Issued {issueText} · Expires {expiresText}
                  </div>

                  {quote.converted_invoice_id ? (
                    <div>
                      <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        Converted
                      </span>
                    </div>
                  ) : null}

                  {additionalNote ? (
                    <div
                      className="max-w-full min-w-0 truncate text-[11px] text-slate-500 dark:text-slate-400"
                      title={additionalNote}
                    >
                      {additionalNote}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrencyAmount(Number(quote.total ?? 0), String(quote.currency ?? businessCurrency))}
                    </div>
                    <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end">
                      <QuoteRowActions
                        quoteId={String(quote.id)}
                        status={String(quote.status)}
                        convertedInvoiceId={(quote.converted_invoice_id as string | null) ?? null}
                        quoteNumber={quote.quote_number}
                        customerName={snapshot.name ?? null}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="app-table-shell hidden md:block">
        <table className="app-table">
          <thead>
            <tr>
              <th className="app-th">Quote Number</th>
              <th className="app-th">Customer</th>
              <th className="app-th">Issue Date</th>
              <th className="app-th">Expiry Date</th>
              <th className="app-th">Status</th>
              <th className="app-th-num">Total</th>
              <th className="app-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody className="app-tbody">
            {filteredQuotes.length === 0 ? (
              <tr>
                <td colSpan={7} className="app-table-empty">
                  No quotes found. Try adjusting your search or filter.
                </td>
              </tr>
            ) : (
              filteredQuotes.map((quote) => {
                const snapshot = (quote.customer_snapshot as { name?: string } | null) ?? {};
                const st = String(quote.status ?? '').toLowerCase();
                const baseLabel = st ? `${st.charAt(0).toUpperCase()}${st.slice(1)}` : 'Draft';
                const acceptedVia = (quote.accepted_via ?? null) as string | null;
                const rejectedVia = (quote.rejected_via ?? null) as string | null;
                const sourceLine = deriveConfirmationLine(
                  st,
                  String(quote.confirmation_channel ?? '').trim() || null,
                  acceptedVia,
                  rejectedVia
                );
                const statusDate =
                  st === 'accepted' || st === 'accepted_customer'
                    ? (quote.accepted_at ? formatDisplayDate(String(quote.accepted_at)) : null)
                    : st === 'rejected' || st === 'rejected_customer'
                      ? (quote.rejected_at ? formatDisplayDate(String(quote.rejected_at)) : null)
                      : null;
                const statusLabel =
                  st === 'accepted'
                    ? isManualConfirmationVia(acceptedVia)
                      ? 'Accepted (manual)'
                      : 'Accepted'
                    : st === 'accepted_customer'
                      ? 'Accepted (customer)'
                    : st === 'rejected'
                      ? isManualConfirmationVia(rejectedVia)
                        ? 'Rejected (manual)'
                        : 'Rejected'
                      : st === 'rejected_customer'
                        ? 'Rejected (customer)'
                      : baseLabel;
                const sourceSubtext = sourceLine
                  ? `${sourceLine}${statusDate ? ` · ${statusDate}` : ''}`
                  : null;
                const additionalNote =
                  st === 'accepted' || st === 'accepted_customer'
                    ? (quote.accepted_note?.trim() ? String(quote.accepted_note).trim() : null)
                    : st === 'rejected' || st === 'rejected_customer'
                      ? (quote.rejection_reason?.trim() ? String(quote.rejection_reason).trim() : null)
                      : null;

                return (
                  <tr key={quote.id} className="app-tr-hover">
                    <td className="app-td">
                      <Link
                        href={`/dashboard/quotes/${quote.id}`}
                        className="font-medium text-indigo-600 dark:text-indigo-400"
                      >
                        {quote.quote_number}
                      </Link>
                    </td>
                    <td className="app-td-primary">{snapshot.name ?? 'Customer'}</td>
                    <td className="app-td-secondary">{formatDisplayDate(String(quote.issue_date))}</td>
                    <td className="app-td-secondary">{quote.expiry_date ? formatDisplayDate(String(quote.expiry_date)) : '—'}</td>
                    <td className="app-td">
                      <div className="flex flex-col">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                            statusColors[st] ?? statusColors.draft
                          }`}
                        >
                          {statusLabel}
                        </span>
                        {sourceSubtext ? (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sourceSubtext}</p>
                        ) : null}
                        {quote.converted_invoice_id ? (
                          <div className="mt-1">
                            <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                              Converted
                            </span>
                          </div>
                        ) : null}
                        {additionalNote ? (
                          <div
                            className="mt-1 max-w-[220px] min-w-0 truncate text-[11px] text-slate-500 dark:text-slate-400"
                            title={additionalNote}
                          >
                            {additionalNote}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="app-td-num font-medium">
                      {formatCurrencyAmount(Number(quote.total ?? 0), String(quote.currency ?? businessCurrency))}
                    </td>
                    <td className="app-td-actions align-middle">
                      <QuoteRowActions
                        quoteId={String(quote.id)}
                        status={String(quote.status)}
                        convertedInvoiceId={(quote.converted_invoice_id as string | null) ?? null}
                        quoteNumber={quote.quote_number}
                        customerName={snapshot.name ?? null}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

