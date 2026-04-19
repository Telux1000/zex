'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useIsLgDown } from '@/hooks/use-is-lg-down';
import { cn } from '@/lib/utils/cn';
import type { InvoiceRecurringSummary } from '@/lib/recurring-invoice/display';
import {
  formatInvoiceListSortIndicator,
  getInvoiceListSortPreference,
  INVOICE_LIST_DEFAULT_ORDER,
  INVOICE_LIST_DEFAULT_SORT,
  INVOICE_LIST_SORT_OPTIONS,
  INVOICE_MANAGEMENT_FILTER_OPEN,
  parseInvoiceListOrderParam,
  parseInvoiceListSortParam,
  setInvoiceListSortPreference,
  SORT_FIELD_SET,
  statusForFilter,
  type SortField,
} from '@/lib/invoices/list-filters';
import { InvoicesTable } from '@/components/invoices/InvoicesTable';
import {
  countActiveInvoiceListFilters,
  INVOICE_QUICK_CHIPS,
  InvoiceListFiltersPanel,
  snapshotFiltersFromUrl,
  type InvoiceFilterDraft,
} from '@/components/invoices/InvoiceListFiltersPanel';

const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_id?: string | null;
  customer_email?: string | null;
  reference_po?: string | null;
  currency?: string;
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
  issue_date?: string | null;
  due_date: string;
  paid_at?: string | null;
  latest_payment_at?: string | null;
  created_at?: string;
  recurring?: InvoiceRecurringSummary | null;
  gross_paid_amount?: number;
  refunded_amount?: number;
  available_refundable_amount?: number;
  refund_action_eligible?: boolean;
};

type CustomerOption = { id: string; name: string };

type Props = {
  customers: CustomerOption[];
  businessId: string;
  currency: string;
  statusColors: Record<string, string>;
};

function useClickOutside(
  open: boolean,
  onClose: () => void,
  refs: React.RefObject<HTMLElement | null>[]
) {
  useEffect(() => {
    if (!open) return;
    const shouldIgnore = (t: Node | null) => {
      if (!t || !(t instanceof Element)) return false;
      if (refs.some((r) => r.current?.contains(t))) return true;
      if (t.closest('[data-searchable-customer-select-portal]')) return true;
      return false;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (shouldIgnore(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, onClose, refs]);
}

const FILTER_PANEL_CLOSE_MS = 280;

export function InvoicesSection({
  customers,
  businessId,
  currency,
  statusColors,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';
  const filter = searchParams.get('filter') ?? '';
  const balance = searchParams.get('balance') ?? '';
  const scheduleFilter = searchParams.get('schedule_filter') ?? '';
  const issue = searchParams.get('issue') ?? '';
  const issue_from = searchParams.get('issue_from') ?? '';
  const issue_to = searchParams.get('issue_to') ?? '';
  const due = searchParams.get('due') ?? '';
  const due_from = searchParams.get('due_from') ?? '';
  const due_to = searchParams.get('due_to') ?? '';
  const customer = searchParams.get('customer') ?? '';
  const sort = parseInvoiceListSortParam(searchParams.get('sort'));
  const order = parseInvoiceListOrderParam(searchParams.get('order'));
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const page_size = Math.min(
    100,
    Math.max(10, parseInt(searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10))
  );

  const [searchInput, setSearchInput] = useState(q);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersEntered, setFiltersEntered] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<InvoiceFilterDraft>(() =>
    snapshotFiltersFromUrl({
      status,
      filter,
      scheduleFilter,
      issue,
      issue_from,
      issue_to,
      due,
      due_from,
      due_to,
      customer,
    })
  );

  const filtersPopoverRef = useRef<HTMLDivElement>(null);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const sortPopoverRef = useRef<HTMLDivElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const isLgDown = useIsLgDown();

  useEffect(() => setSearchInput(q), [q]);

  useEffect(() => {
    if (searchParams.has('sort')) return;
    const next = new URLSearchParams(searchParams.toString());
    const pref = getInvoiceListSortPreference();
    if (pref && SORT_FIELD_SET.has(pref.sort)) {
      next.set('sort', pref.sort);
      next.set('order', pref.order);
    } else {
      next.set('sort', INVOICE_LIST_DEFAULT_SORT);
      next.set('order', INVOICE_LIST_DEFAULT_ORDER);
    }
    const qs = next.toString();
    router.replace(`/dashboard/invoices?${qs}`, { scroll: false });
  }, [router, searchParams]);

  const updateUrl = useCallback(
    (updates: Record<string, string | number | undefined>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      if (resetPage) next.delete('page');
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      router.push(`/dashboard/invoices?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      const next = searchInput.trim();
      if (next !== q) updateUrl({ q: next || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySearchNow = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    updateUrl({ q: searchInput.trim() || undefined });
  }, [searchInput, updateUrl]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('business_id', businessId);
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (filter) params.set('filter', filter);
    if (balance) params.set('balance', balance);
    if (scheduleFilter) params.set('schedule_filter', scheduleFilter);
    if (issue) params.set('issue', issue);
    if (issue_from) params.set('issue_from', issue_from);
    if (issue_to) params.set('issue_to', issue_to);
    if (due) params.set('due', due);
    if (due_from) params.set('due_from', due_from);
    if (due_to) params.set('due_to', due_to);
    if (customer) params.set('customer', customer);
    params.set('sort', sort);
    params.set('order', order);
    params.set('page', String(page));
    params.set('page_size', String(page_size));

    setLoading(true);
    fetch(`/api/invoices?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setInvoices(data.invoices ?? []);
        setTotalCount(data.totalCount ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setInvoices([]);
          setTotalCount(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    businessId,
    q,
    status,
    filter,
    balance,
    scheduleFilter,
    issue,
    issue_from,
    issue_to,
    due,
    due_from,
    due_to,
    customer,
    sort,
    order,
    page,
    page_size,
    refreshKey,
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / page_size));
  const currentPage = Math.min(page, totalPages);
  const start = totalCount === 0 ? 0 : (currentPage - 1) * page_size + 1;
  const end = Math.min(currentPage * page_size, totalCount);

  const displayStatusForInv = useCallback((inv: InvoiceRow) => statusForFilter(inv), []);

  const filtersButtonCount = countActiveInvoiceListFilters({
    q: '',
    status,
    filter,
    balance,
    scheduleFilter,
    issue,
    issue_from,
    issue_to,
    due,
    due_from,
    due_to,
    customer,
  });

  const hasListFilters =
    Boolean(q.trim()) ||
    Boolean(status) ||
    Boolean(filter) ||
    Boolean(balance) ||
    Boolean(scheduleFilter) ||
    Boolean(issue) ||
    Boolean(due) ||
    Boolean(customer);

  const requestCloseFilters = useCallback(() => {
    setFiltersEntered(false);
    window.setTimeout(() => setFiltersOpen(false), FILTER_PANEL_CLOSE_MS);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setFiltersEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [filtersOpen]);

  const openFiltersPanel = () => {
    setFilterDraft(
      snapshotFiltersFromUrl({
        status,
        filter,
        scheduleFilter,
        issue,
        issue_from,
        issue_to,
        due,
        due_from,
        due_to,
        customer,
      })
    );
    setFiltersEntered(false);
    setFiltersOpen(true);
    setSortOpen(false);
  };

  const applyFilterDraft = useCallback(() => {
    if (filterDraft.useOpenFilter) {
      updateUrl({
        filter: INVOICE_MANAGEMENT_FILTER_OPEN,
        status: undefined,
        balance: undefined,
        schedule_filter: filterDraft.scheduleFilter || undefined,
        issue: filterDraft.issue || undefined,
        issue_from:
          filterDraft.issue === 'custom' ? filterDraft.issue_from || undefined : undefined,
        issue_to: filterDraft.issue === 'custom' ? filterDraft.issue_to || undefined : undefined,
        due: filterDraft.due || undefined,
        due_from:
          filterDraft.due === 'custom' ? filterDraft.due_from || undefined : undefined,
        due_to: filterDraft.due === 'custom' ? filterDraft.due_to || undefined : undefined,
        customer: filterDraft.customer || undefined,
      });
    } else {
      updateUrl({
        filter: undefined,
        balance: undefined,
        status: filterDraft.status || undefined,
        schedule_filter: filterDraft.scheduleFilter || undefined,
        issue: filterDraft.issue || undefined,
        issue_from:
          filterDraft.issue === 'custom' ? filterDraft.issue_from || undefined : undefined,
        issue_to: filterDraft.issue === 'custom' ? filterDraft.issue_to || undefined : undefined,
        due: filterDraft.due || undefined,
        due_from:
          filterDraft.due === 'custom' ? filterDraft.due_from || undefined : undefined,
        due_to: filterDraft.due === 'custom' ? filterDraft.due_to || undefined : undefined,
        customer: filterDraft.customer || undefined,
      });
    }
    requestCloseFilters();
  }, [filterDraft, updateUrl, requestCloseFilters]);

  const resetFilterDraft = () => {
    setFilterDraft({
      status: '',
      useOpenFilter: false,
      scheduleFilter: '',
      issue: '',
      issue_from: '',
      issue_to: '',
      due: '',
      due_from: '',
      due_to: '',
      customer: '',
    });
    updateUrl({
      status: undefined,
      filter: undefined,
      balance: undefined,
      schedule_filter: undefined,
      issue: undefined,
      issue_from: undefined,
      issue_to: undefined,
      due: undefined,
      due_from: undefined,
      due_to: undefined,
      customer: undefined,
    });
  };

  useClickOutside(sortOpen, () => setSortOpen(false), [sortPopoverRef, sortBtnRef]);
  useClickOutside(filtersOpen, requestCloseFilters, [filtersPopoverRef, filtersBtnRef]);

  useEffect(() => {
    if (!filtersOpen && !sortOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (filtersOpen) requestCloseFilters();
        setSortOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtersOpen, sortOpen, requestCloseFilters]);

  useEffect(() => {
    if (!filtersOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [filtersOpen]);

  const sortIndicator = formatInvoiceListSortIndicator(sort, order);

  const chipActive = (key: (typeof INVOICE_QUICK_CHIPS)[number]['key']) => {
    if (key === 'all') return !status && !filter;
    const def = INVOICE_QUICK_CHIPS.find((c) => c.key === key);
    return Boolean(def?.status && status === def.status && !filter);
  };

  const applyQuickChip = (key: (typeof INVOICE_QUICK_CHIPS)[number]['key']) => {
    if (key === 'all') {
      updateUrl({ status: undefined, filter: undefined, balance: undefined });
      return;
    }
    const def = INVOICE_QUICK_CHIPS.find((c) => c.key === key);
    if (def?.status) {
      updateUrl({ status: def.status, filter: undefined, balance: undefined });
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-30 -mx-1 space-y-3 border-b border-slate-200/90 bg-white/95 px-1 pb-3 pt-1 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <label htmlFor="invoice-search" className="sr-only">
              Search invoices
            </label>
            <input
              id="invoice-search"
              type="search"
              placeholder="Search invoices…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearchNow();
              }}
            />
          </div>

          <div className="relative shrink-0">
            <button
              ref={filtersBtnRef}
              type="button"
              onClick={() => (filtersOpen ? requestCloseFilters() : openFiltersPanel())}
              className={cn(
                'inline-flex min-h-11 min-w-0 max-w-full touch-manipulation items-center justify-center gap-2 rounded-xl border px-2.5 py-2.5 text-sm font-medium shadow-sm transition-colors sm:px-3',
                filtersOpen || filtersButtonCount > 0
                  ? 'border-indigo-300/70 bg-indigo-50 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-950/60 dark:text-indigo-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              )}
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              <span className="min-w-0 truncate text-xs font-semibold sm:text-sm">
                {filtersButtonCount > 0 ? `Filters (${filtersButtonCount})` : 'Filters'}
              </span>
            </button>

            {filtersOpen && isLgDown && typeof document !== 'undefined'
              ? createPortal(
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      className={cn(
                        'fixed inset-0 z-[70] touch-manipulation bg-slate-950/40 transition-opacity duration-300 ease-out',
                        filtersEntered ? 'opacity-100' : 'opacity-0'
                      )}
                      onClick={requestCloseFilters}
                    />
                    <div
                      ref={filtersPopoverRef}
                      className={cn(
                        'fixed inset-x-0 bottom-0 z-[71] flex max-h-[min(85dvh,640px)] min-h-0 flex-col',
                        'rounded-t-2xl border border-slate-200 bg-white shadow-[0_-12px_48px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out',
                        'dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_-12px_48px_rgba(0,0,0,0.45)]',
                        filtersEntered ? 'translate-y-0' : 'translate-y-full'
                      )}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Invoice filters"
                    >
                      <div
                        className="flex shrink-0 flex-col border-b border-slate-100 pt-2 dark:border-slate-800"
                        aria-hidden
                      >
                        <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-slate-300/90 dark:bg-slate-600" />
                        <div className="flex items-center justify-between px-1 pb-3">
                          <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                            Filters
                          </span>
                          <button
                            type="button"
                            className="touch-manipulation rounded-xl p-3 text-slate-500 active:bg-slate-100 dark:active:bg-slate-800"
                            aria-label="Close filters"
                            onClick={requestCloseFilters}
                          >
                            <X className="h-5 w-5" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
                        <InvoiceListFiltersPanel
                          draft={filterDraft}
                          setDraft={setFilterDraft}
                          customers={customers}
                          onApply={applyFilterDraft}
                          onReset={resetFilterDraft}
                          variant="sheet"
                        />
                      </div>
                    </div>
                  </>,
                  document.body
                )
              : null}
            {filtersOpen && !isLgDown && typeof document !== 'undefined'
              ? createPortal(
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label="Close filters"
                      className={cn(
                        'fixed inset-0 z-[68] touch-manipulation bg-slate-950/40 backdrop-blur-[1px] transition-opacity duration-300 ease-out',
                        filtersEntered ? 'opacity-100' : 'opacity-0'
                      )}
                      onClick={requestCloseFilters}
                    />
                    <div
                      ref={filtersPopoverRef}
                      className={cn(
                        'fixed right-0 top-0 z-[69] flex h-dvh max-h-dvh w-full max-w-[min(100%,26rem)] flex-col border-l border-slate-200 bg-white shadow-[-12px_0_48px_rgba(15,23,42,0.08)] transition-transform duration-300 ease-out',
                        'dark:border-slate-700 dark:bg-slate-900 dark:shadow-[-12px_0_48px_rgba(0,0,0,0.35)]',
                        filtersEntered ? 'translate-x-0' : 'translate-x-full'
                      )}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Invoice filters"
                    >
                      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                          Filters
                        </h2>
                        <button
                          type="button"
                          className="touch-manipulation rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                          aria-label="Close filters"
                          onClick={requestCloseFilters}
                        >
                          <X className="h-5 w-5" aria-hidden />
                        </button>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-1 pt-1">
                        <InvoiceListFiltersPanel
                          draft={filterDraft}
                          setDraft={setFilterDraft}
                          customers={customers}
                          onApply={applyFilterDraft}
                          onReset={resetFilterDraft}
                          variant="drawer"
                        />
                      </div>
                    </div>
                  </>,
                  document.body
                )
              : null}
          </div>

          <div className="relative shrink-0">
            <button
              ref={sortBtnRef}
              type="button"
              onClick={() => {
                setSortOpen((o) => !o);
                setFiltersOpen(false);
              }}
              className={cn(
                'inline-flex min-w-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium shadow-sm transition-colors sm:gap-2',
                sortOpen
                  ? 'border-indigo-300/70 bg-indigo-50 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-950/60 dark:text-indigo-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              )}
              aria-label={`Sort: ${sortIndicator}`}
            >
              <ArrowUpDown className="h-4 w-4 shrink-0 opacity-80 sm:hidden" aria-hidden />
              <span className="hidden shrink-0 text-slate-500 dark:text-slate-400 sm:inline">Sort:</span>
              <span className="min-w-0 max-w-[10rem] truncate text-left sm:max-w-[12rem]">
                {sortIndicator}
              </span>
            </button>
            {sortOpen && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  className="fixed inset-0 z-40 bg-black/40 sm:hidden"
                  onClick={() => setSortOpen(false)}
                />
                <div
                  ref={sortPopoverRef}
                  className={cn(
                    'z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900',
                    'fixed left-1/2 top-20 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64 sm:translate-x-0'
                  )}
                  role="dialog"
                  aria-label="Sort invoices"
                >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Sort by
                </p>
                <div className="space-y-1">
                  {INVOICE_LIST_SORT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        setInvoiceListSortPreference(o.value as SortField, order);
                        updateUrl({ sort: o.value });
                        setSortOpen(false);
                      }}
                      className={cn(
                        'flex w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                        sort === o.value
                          ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Order
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const nextOrder = order === 'asc' ? 'desc' : 'asc';
                      setInvoiceListSortPreference(sort, nextOrder);
                      updateUrl({ order: nextOrder });
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {order === 'asc' ? (
                      <>
                        <ArrowUpAZ className="h-4 w-4" aria-hidden />
                        Ascending
                      </>
                    ) : (
                      <>
                        <ArrowDownAZ className="h-4 w-4" aria-hidden />
                        Descending
                      </>
                    )}
                  </button>
                </div>
              </div>
              </>
            )}
          </div>
        </div>

        <div
          className={cn(
            'flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none]',
            '[&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]'
          )}
          role="tablist"
          aria-label="Quick filters"
        >
          {INVOICE_QUICK_CHIPS.map((c) => {
            const active = chipActive(c.key);
            const tone = c.tone ?? 'default';
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => applyQuickChip(c.key)}
                className={cn(
                  'min-h-11 shrink-0 touch-manipulation rounded-full border px-4 py-2.5 text-sm font-medium transition-all',
                  'active:opacity-90 sm:min-h-0 sm:py-2',
                  active
                    ? tone === 'warning'
                      ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25 dark:border-amber-400 dark:bg-amber-600 dark:shadow-amber-900/30'
                      : 'border-indigo-400 bg-indigo-600 text-white shadow-md shadow-indigo-500/20 dark:border-indigo-500 dark:bg-indigo-500'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:active:bg-slate-800 sm:hover:border-slate-300 sm:hover:bg-slate-50 dark:sm:hover:border-slate-600'
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {loading
            ? 'Fetching invoices…'
            : totalCount === 0
              ? null
              : `Showing ${start}–${end} of ${totalCount}`}
        </p>

        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
              <svg
                className="h-8 w-8 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm">Fetching invoices…</span>
            </div>
          </div>
        ) : totalCount === 0 && hasListFilters ? (
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white px-6 py-16 text-center dark:border-slate-800 dark:from-slate-900/80 dark:to-slate-900">
            <p className="text-base font-medium text-slate-800 dark:text-slate-100">
              No invoices match your filters
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Try adjusting search or filters, or create a new invoice.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams();
                  next.set('sort', sort);
                  next.set('order', order);
                  next.set('page_size', String(page_size));
                  router.push(`/dashboard/invoices?${next}`, { scroll: false });
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Clear filters
              </button>
              <Link
                href="/dashboard/invoices/new"
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
              >
                New invoice
              </Link>
            </div>
          </div>
        ) : (
          <>
            <InvoicesTable
              invoices={invoices}
              businessId={businessId}
              currency={currency}
              currentStatus={status || undefined}
              statusColors={statusColors}
              displayStatusForInv={displayStatusForInv}
              onMutationSuccess={refetch}
            />

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <label htmlFor="page-size">Per page</label>
                  <select
                    id="page-size"
                    value={page_size}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      updateUrl({ page_size: v });
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateUrl({ page: currentPage - 1 }, false)}
                    disabled={currentPage <= 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.04] disabled:pointer-events-none disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-400/5"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateUrl({ page: currentPage + 1 }, false)}
                    disabled={currentPage >= totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.04] disabled:pointer-events-none disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-400/5"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
