'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO, startOfDay, subDays } from 'date-fns';
import { SlidersHorizontal } from 'lucide-react';
import {
  AUDIT_ACTION_FILTER_OPTIONS,
  ENTITY_TYPE_FILTER_OPTIONS,
  formatAuditLog,
  formatEntityTypeLabel,
  type AuditEntityType,
  type AuditLogRow,
} from '@/lib/audit-log';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';
import { AuditLogSourceCell } from '@/components/audit/AuditLogSourceCell';
import { AuditLogUserCell } from '@/components/audit/AuditLogUserCell';
import { cn } from '@/lib/utils/cn';

type UserOption = { id: string; name: string; email: string };

type Props = {
  accountId: string;
  users: UserOption[];
};

type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

/** Resource filter: entity types plus “Reminders” (action group), matching admin API. */
type ResourceFilter = '' | AuditEntityType | 'reminders';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function computeDateRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { dateFrom: string; dateTo: string } {
  if (preset === 'custom') {
    return { dateFrom: customFrom, dateTo: customTo };
  }
  if (preset === 'all') {
    return { dateFrom: '', dateTo: '' };
  }
  const today = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  if (preset === 'today') {
    const d = fmt(startOfDay(today));
    return { dateFrom: d, dateTo: d };
  }
  if (preset === '7d') {
    return { dateFrom: fmt(startOfDay(subDays(today, 6))), dateTo: fmt(today) };
  }
  if (preset === '30d') {
    return { dateFrom: fmt(startOfDay(subDays(today, 29))), dateTo: fmt(today) };
  }
  return { dateFrom: '', dateTo: '' };
}

const SOURCE_OPTIONS: { value: '' | 'user' | 'assistant' | 'api' | 'cron'; label: string; hint?: string }[] = [
  { value: '', label: 'All sources' },
  { value: 'user', label: 'User (app)', hint: 'Manual / default' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'api', label: 'API' },
  { value: 'cron', label: 'System (cron)', hint: 'Automated reminders' },
];

const RESOURCE_OPTIONS: { value: ResourceFilter; label: string }[] = [
  { value: '', label: 'All resources' },
  ...ENTITY_TYPE_FILTER_OPTIONS.map((o) => ({
    value: o.value as ResourceFilter,
    label: o.value === 'team' ? 'Team (account)' : o.label,
  })),
  { value: 'reminders', label: 'Reminders' },
];

export function AdminAccountAuditSection({ accountId, users }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>('');
  const [actionFilter, setActionFilter] = useState('');
  const [involvingUserId, setInvolvingUserId] = useState('');
  const [metadataSource, setMetadataSource] = useState<'' | 'user' | 'assistant' | 'api' | 'cron'>('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { dateFrom, dateTo } = useMemo(
    () => computeDateRange(datePreset, customDateFrom, customDateTo),
    [datePreset, customDateFrom, customDateTo]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      if (resourceFilter === 'reminders') {
        params.set('action_group', 'reminders');
      } else {
        if (resourceFilter) params.set('entity_type', resourceFilter);
        if (actionFilter) params.set('action', actionFilter);
      }
      if (involvingUserId) params.set('involving_user_id', involvingUserId);
      if (metadataSource) params.set('metadata_source', metadataSource);

      const res = await fetch(`/api/admin/accounts/${accountId}/audit-logs?${params.toString()}`);
      const data = (await res.json()) as {
        error?: string;
        logs?: AuditLogRow[];
        total?: number;
        allTotal?: number;
        totalPages?: number;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load activity');
      setLogs((data.logs ?? []) as AuditLogRow[]);
      setTotal(Number(data.total ?? 0));
      setAllTotal(Number(data.allTotal ?? 0));
      setTotalPages(Math.max(1, Number(data.totalPages ?? 1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
      setLogs([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [
    accountId,
    page,
    pageSize,
    debouncedSearch,
    dateFrom,
    dateTo,
    resourceFilter,
    actionFilter,
    involvingUserId,
    metadataSource,
  ]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const hasActiveFilters =
    Boolean(searchInput.trim()) ||
    datePreset !== 'all' ||
    Boolean(resourceFilter) ||
    Boolean(actionFilter) ||
    Boolean(involvingUserId) ||
    Boolean(metadataSource);

  function clearAllFilters() {
    setSearchInput('');
    setDatePreset('all');
    setCustomDateFrom('');
    setCustomDateTo('');
    setResourceFilter('');
    setActionFilter('');
    setInvolvingUserId('');
    setMetadataSource('');
    setPage(1);
  }

  return (
    <AdminContentCard>
      <div className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Activity</h3>
            <p className="mt-1 max-w-2xl text-xs text-zinc-500 dark:text-zinc-400">
              Same audit trail and filter model as subscriber Settings → Audit Log (read-only). Search covers
              invoice and customer metadata, action text, and actor name—matching the workspace API.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="Search invoices, customers, actions, actors…"
              className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              aria-label="Search activity"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Date
                <select
                  value={datePreset}
                  onChange={(e) => {
                    setDatePreset(e.target.value as DatePreset);
                    setPage(1);
                  }}
                  className="h-10 min-w-[10rem] rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="all">All time</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="custom">Custom range</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                <SlidersHorizontal className="h-4 w-4 text-zinc-500" aria-hidden />
                Filters
              </button>
              <button
                type="button"
                onClick={clearAllFilters}
                disabled={!hasActiveFilters}
                className="h-10 rounded-lg px-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Clear all
              </button>
            </div>
          </div>

          {datePreset === 'custom' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                From
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => {
                    setCustomDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                To
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => {
                    setCustomDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            </div>
          ) : null}

          <div
            className={cn(
              'grid transition-all duration-200',
              filtersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={cn(
                  'rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40',
                  filtersOpen ? 'pointer-events-auto' : 'pointer-events-none'
                )}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Resource
                    <select
                      value={resourceFilter}
                      onChange={(e) => {
                        setResourceFilter(e.target.value as ResourceFilter);
                        setPage(1);
                      }}
                      className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {RESOURCE_OPTIONS.map((o) => (
                        <option key={o.value || 'all'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Action
                    <select
                      value={actionFilter}
                      onChange={(e) => {
                        setActionFilter(e.target.value);
                        setPage(1);
                      }}
                      className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      disabled={Boolean(resourceFilter === 'reminders')}
                    >
                      <option value="">All actions</option>
                      {AUDIT_ACTION_FILTER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Focus on user
                    <select
                      value={involvingUserId}
                      onChange={(e) => {
                        setInvolvingUserId(e.target.value);
                        setPage(1);
                      }}
                      className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="">Everyone</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Source
                    <select
                      value={metadataSource}
                      onChange={(e) => {
                        setMetadataSource(e.target.value as '' | 'user' | 'assistant' | 'api' | 'cron');
                        setPage(1);
                      }}
                      className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {SOURCE_OPTIONS.map((o) => (
                        <option key={o.value || 'all'} value={o.value} title={o.hint}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-500">
                  Source filters use stored metadata (manual, assistant, API) and cron-based reminder jobs. Team
                  actions often have no source tag—they are included under User (app).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2 py-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800"
                aria-hidden
              />
            ))}
            <p className="text-center text-xs text-zinc-500">Loading activity…</p>
          </div>
        ) : !logs.length ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            {allTotal === 0
              ? 'No audit activity recorded for this workspace yet.'
              : 'No activity matches these filters.'}
          </p>
        ) : (
          <AdminTable>
            <AdminTableHead>
              <AdminTh className="min-w-[14rem]">Action</AdminTh>
              <AdminTh>User</AdminTh>
              <AdminTh>Source</AdminTh>
              <AdminTh>Entity</AdminTh>
              <AdminTh>When</AdminTh>
            </AdminTableHead>
            <tbody>
              {logs.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd className="max-w-md text-sm text-zinc-800 dark:text-zinc-200">
                    {formatAuditLog(row, {
                      audience: 'internal',
                      internalStaffActorStyle: 'name',
                    })}
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                    <AuditLogUserCell row={row} />
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                    <AuditLogSourceCell row={row} />
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-400">
                    {formatEntityTypeLabel(row.entity_type)}
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-500">
                    {format(parseISO(row.created_at), 'MMM d, yyyy · h:mm a')}
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </div>

      {!loading && logs.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            {total.toLocaleString()} matching {total === 1 ? 'entry' : 'entries'}
            {hasActiveFilters && allTotal !== total ? ` · ${allTotal.toLocaleString()} total in workspace` : null}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              Rows
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number.parseInt(e.target.value, 10) || 25);
                  setPage(1);
                }}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
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
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Previous
              </button>
              <span className="text-xs text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminContentCard>
  );
}
