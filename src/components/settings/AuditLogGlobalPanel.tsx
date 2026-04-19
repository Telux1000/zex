'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { SlidersHorizontal } from 'lucide-react';
import {
  AUDIT_ACTION_FILTER_OPTIONS,
  ENTITY_TYPE_FILTER_OPTIONS,
  formatAuditLog,
  formatEntityTypeLabel,
  type AuditLogRow,
} from '@/lib/audit-log';
import { AuditLogSourceCell } from '@/components/audit/AuditLogSourceCell';
import { AuditLogUserCell } from '@/components/audit/AuditLogUserCell';
import { cn } from '@/lib/utils/cn';

type ActorOption = { userId: string | null; label: string };

type Props = {
  businessId: string;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function actorLabel(actorValue: string, options: ActorOption[]): string {
  if (!actorValue) return '';
  if (actorValue.startsWith('id:')) {
    const id = actorValue.slice(3);
    return options.find((o) => o.userId === id)?.label ?? id;
  }
  if (actorValue.startsWith('label:')) {
    return decodeURIComponent(actorValue.slice(6));
  }
  return '';
}

export function AuditLogGlobalPanel({ businessId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entityType, setEntityType] = useState(searchParams.get('entity_type') ?? '');
  const [action, setAction] = useState(searchParams.get('action') ?? '');
  const initialActorId = searchParams.get('performed_by_user_id') ?? '';
  const [actorValue, setActorValue] = useState(initialActorId ? `id:${initialActorId}` : '');
  const [actorSearch, setActorSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(
    Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  );
  const [pageSize, setPageSize] = useState(
    Math.max(1, Number.parseInt(searchParams.get('page_size') ?? '25', 10) || 25)
  );
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [actorOptions, setActorOptions] = useState<ActorOption[]>([]);
  const [total, setTotal] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filteredActorOptions = useMemo(() => {
    const q = actorSearch.trim().toLowerCase();
    if (!q) return actorOptions;
    return actorOptions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actorOptions, actorSearch]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ business_id: businessId });
      if (entityType) params.set('entity_type', entityType);
      if (action) params.set('action', action);
      if (actorValue.startsWith('id:')) {
        params.set('performed_by_user_id', actorValue.slice(3));
      } else if (actorValue.startsWith('label:')) {
        params.set('performed_by_name', decodeURIComponent(actorValue.slice(6)));
      }
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load audit log');
      setLogs((data.logs ?? []) as AuditLogRow[]);
      setActorOptions((data.actorOptions ?? []) as ActorOption[]);
      setTotal(Number(data.total ?? 0));
      setAllTotal(Number(data.allTotal ?? 0));
      setTotalPages(Math.max(1, Number(data.totalPages ?? 1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setLogs([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [businessId, entityType, action, actorValue, dateFrom, dateTo, debouncedSearch, page, pageSize]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('section', 'audit');
    if (entityType) params.set('entity_type', entityType);
    else params.delete('entity_type');
    if (action) params.set('action', action);
    else params.delete('action');
    if (actorValue.startsWith('id:')) params.set('performed_by_user_id', actorValue.slice(3));
    else params.delete('performed_by_user_id');
    if (dateFrom) params.set('date_from', dateFrom);
    else params.delete('date_from');
    if (dateTo) params.set('date_to', dateTo);
    else params.delete('date_to');
    if (debouncedSearch) params.set('search', debouncedSearch);
    else params.delete('search');
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname, entityType, action, actorValue, dateFrom, dateTo, debouncedSearch, page, pageSize]);

  const onFilterChange = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setPage(1);
  };

  const entityLabel = ENTITY_TYPE_FILTER_OPTIONS.find((o) => o.value === entityType)?.label;
  const actionLabel = AUDIT_ACTION_FILTER_OPTIONS.find((o) => o.value === action)?.label;
  const userChipLabel = actorLabel(actorValue, actorOptions);

  const filterChips: { key: string; label: string; onRemove: () => void }[] = [];
  const q = searchInput.trim();
  if (q) {
    filterChips.push({
      key: 'search',
      label: q.length > 28 ? `${q.slice(0, 28)}…` : q,
      onRemove: () => onFilterChange(setSearchInput, ''),
    });
  }
  if (entityType && entityLabel) {
    filterChips.push({
      key: 'entity',
      label: entityLabel,
      onRemove: () => onFilterChange(setEntityType, ''),
    });
  }
  if (action && actionLabel) {
    filterChips.push({
      key: 'action',
      label: actionLabel,
      onRemove: () => onFilterChange(setAction, ''),
    });
  }
  if (actorValue && userChipLabel) {
    filterChips.push({
      key: 'user',
      label: userChipLabel,
      onRemove: () => {
        onFilterChange(setActorValue, '');
        setActorSearch('');
      },
    });
  }
  if (dateFrom || dateTo) {
    const range =
      dateFrom && dateTo
        ? `${dateFrom} → ${dateTo}`
        : dateFrom
          ? `From ${dateFrom}`
          : `To ${dateTo}`;
    filterChips.push({
      key: 'date',
      label: range,
      onRemove: () => {
        setDateFrom('');
        setDateTo('');
        setPage(1);
      },
    });
  }

  const hasActiveFilters =
    Boolean(searchInput.trim()) ||
    Boolean(entityType) ||
    Boolean(action) ||
    Boolean(actorValue) ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(debouncedSearch);

  const clearAllFilters = () => {
    setEntityType('');
    setAction('');
    setActorValue('');
    setActorSearch('');
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setPage(1);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Audit Log</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        All recorded actions across customers, invoices, and payments.
      </p>

      <div className="sticky top-0 z-10 mt-6 rounded-xl border border-slate-200/80 bg-white/90 p-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              value={searchInput}
              onChange={(e) => onFilterChange(setSearchInput, e.target.value)}
              placeholder="Search activity..."
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-neutral-900 dark:text-slate-100 dark:hover:bg-neutral-800"
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
              Filters
            </button>
          </div>

          {filterChips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                >
                  <span className="truncate">{chip.label}</span>
                  <span className="shrink-0 opacity-70" aria-hidden>
                    ✕
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div
            className={cn(
              'grid transition-all duration-200 ease-in-out',
              filtersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={cn(
                  'mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 ease-in-out dark:border-neutral-800 dark:bg-neutral-900',
                  filtersOpen ? 'pointer-events-auto' : 'pointer-events-none'
                )}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex w-full flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    User
                    <input
                      value={actorSearch}
                      onChange={(e) => setActorSearch(e.target.value)}
                      placeholder="Search users…"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-neutral-950 dark:text-slate-100"
                    />
                    <select
                      value={actorValue}
                      onChange={(e) => onFilterChange(setActorValue, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-neutral-950 dark:text-slate-100"
                    >
                      <option value="">All users</option>
                      {filteredActorOptions.map((a, idx) => {
                        const v = a.userId ? `id:${a.userId}` : `label:${encodeURIComponent(a.label)}`;
                        return (
                          <option key={`${v}-${idx}`} value={v}>
                            {a.label}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label className="flex w-full flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    Action
                    <select
                      value={action}
                      onChange={(e) => onFilterChange(setAction, e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-neutral-950 dark:text-slate-100"
                    >
                      <option value="">All</option>
                      {AUDIT_ACTION_FILTER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex w-full flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    Entity type
                    <select
                      value={entityType}
                      onChange={(e) => onFilterChange(setEntityType, e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-neutral-950 dark:text-slate-100"
                    >
                      <option value="">All</option>
                      {ENTITY_TYPE_FILTER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex w-full flex-col gap-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Date range</span>
                    <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-500">
                      From
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => onFilterChange(setDateFrom, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-neutral-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-500">
                      To
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => onFilterChange(setDateTo, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-neutral-950 dark:text-slate-100"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-neutral-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {loading ? 'Loading…' : `${total.toLocaleString()} matching entries`}
                  </p>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    disabled={!hasActiveFilters}
                    className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="app-table-shell mt-6">
        {loading ? (
          <p className="app-table-empty">Loading…</p>
        ) : !logs.length ? (
          <p className="app-table-empty">
            {allTotal === 0 ? 'No activity yet.' : 'No matching activity.'}
          </p>
        ) : (
          <>
            {/* Mobile / narrow: card stack — avoids horizontal scroll and tiny tables */}
            <div className="space-y-3 p-3 md:hidden">
              {logs.map((row) => (
                <article
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50"
                >
                  <p className="min-w-0 break-words text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">
                    {formatAuditLog(row, { audience: 'subscriber' })}
                  </p>
                  <dl className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-600 dark:text-slate-400">
                    <div>
                      <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                        User
                      </dt>
                      <dd className="mt-1 min-w-0 break-words text-sm text-slate-800 dark:text-slate-200">
                        <AuditLogUserCell row={row} />
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                          Source
                        </dt>
                        <dd className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                          <AuditLogSourceCell row={row} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                          Entity
                        </dt>
                        <dd className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                          {formatEntityTypeLabel(row.entity_type)}
                        </dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                        Date & time
                      </dt>
                      <dd className="mt-1 tabular-nums text-sm text-slate-800 dark:text-slate-200">
                        <time dateTime={row.created_at}>
                          {format(parseISO(row.created_at), 'MMM d, yyyy · h:mm a')}
                        </time>
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="hidden md:block">
              <div className="app-table-scroll">
                <table className="app-table text-left">
                  <thead>
                    <tr>
                      <th className="app-th min-w-[16rem]">
                        Action
                      </th>
                      <th className="app-th whitespace-nowrap">
                        User
                      </th>
                      <th className="app-th whitespace-nowrap">
                        Source
                      </th>
                      <th className="app-th whitespace-nowrap">
                        Entity
                      </th>
                      <th className="app-th whitespace-nowrap">
                        Date & time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="app-tbody">
                    {logs.map((row) => (
                      <tr key={row.id} className="app-tr-hover align-top">
                        <td className="app-td-primary">
                          {formatAuditLog(row, { audience: 'subscriber' })}
                        </td>
                        <td className="app-td-secondary whitespace-nowrap">
                          <AuditLogUserCell row={row} />
                        </td>
                        <td className="app-td-secondary whitespace-nowrap">
                          <AuditLogSourceCell row={row} />
                        </td>
                        <td className="app-td-secondary whitespace-nowrap">
                          {formatEntityTypeLabel(row.entity_type)}
                        </td>
                        <td className="app-td-secondary whitespace-nowrap">
                          <time dateTime={row.created_at}>
                            {format(parseISO(row.created_at), 'MMM d, yyyy · h:mm a')}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          Rows
          <select
            value={String(pageSize)}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10) || 25;
              setPageSize(next);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
