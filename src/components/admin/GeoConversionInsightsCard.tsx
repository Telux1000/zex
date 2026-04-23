'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { cn } from '@/lib/utils/cn';
import { flagEmojiFromIso } from '@/lib/location/resolve-country-input';

type GeoSortBy =
  | 'visitors_count'
  | 'registered_count'
  | 'paid_count'
  | 'revenue_total'
  | 'visitor_to_registered_rate'
  | 'registered_to_paid_rate';

type GeoRow = {
  country_code: string | null;
  country_name: string;
  visitors_count: number;
  registered_count: number;
  paid_count: number;
  revenue_total: number;
  visitor_to_registered_rate: number;
  registered_to_paid_rate: number;
  top_subscription_plan: string;
  top_industry: string;
};

type GeoPayload = {
  period: { label: string; days: number };
  rows: GeoRow[];
};

const RANGE_OPTIONS = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
] as const;

const SORT_COLUMNS: Array<{ key: GeoSortBy; label: string; tooltip?: string }> = [
  { key: 'visitors_count', label: 'Visitors' },
  { key: 'registered_count', label: 'Registered' },
  { key: 'paid_count', label: 'Paid' },
  {
    key: 'revenue_total',
    label: 'Revenue',
    tooltip: 'Successful payments recorded in the selected period.',
  },
  { key: 'visitor_to_registered_rate', label: 'Visitor→Registered %' },
  { key: 'registered_to_paid_rate', label: 'Registered→Paid %' },
];

function formatRate(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function SortableHeader({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="hover:text-zinc-900 dark:hover:text-zinc-100" onClick={onClick}>
      {children}
      {active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </button>
  );
}

export function GeoConversionInsightsCard({
  selectedDays,
  onDaysChange,
}: {
  selectedDays?: number;
  onDaysChange?: (days: number) => void;
}) {
  const [localDays, setLocalDays] = useState<number>(30);
  const days = selectedDays ?? localDays;
  const [sortBy, setSortBy] = useState<GeoSortBy>('revenue_total');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<GeoPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      days: String(days),
      limit: '15',
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    fetch(`/api/admin/analytics/geo-conversion?${params.toString()}`)
      .then(async (res) => {
        const json = (await res.json()) as { error?: string } & Partial<GeoPayload>;
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        if (json.error) throw new Error(json.error);
        if (!cancelled) setPayload(json as GeoPayload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load geo analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, sortBy, sortOrder]);

  const activeSortLabel = useMemo(() => {
    return SORT_COLUMNS.find((col) => col.key === sortBy)?.label ?? 'Paid';
  }, [sortBy]);

  function toggleSort(next: GeoSortBy) {
    if (sortBy === next) {
      setSortOrder((cur) => (cur === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortBy(next);
    setSortOrder(next === 'paid_count' ? 'desc' : 'desc');
  }

  return (
    <AdminContentCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <BarChart3 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Geo Conversion Insights</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Where visitor demand, signups, and paid conversion are strongest by country.
            </p>
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              Sorted by {activeSortLabel} ({sortOrder.toUpperCase()})
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => (onDaysChange ? onDaysChange(option.days) : setLocalDays(option.days))}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                days === option.days
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-200/90 dark:border-zinc-800">
          <div className="min-w-[62rem] animate-pulse p-4">
            <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-3 h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-3 h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/25 dark:text-red-300">
          {error}
        </div>
      ) : !payload?.rows?.length ? (
        <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          No geo conversion data available for this period.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200/90 dark:border-zinc-800">
          <table className="w-full min-w-[62rem] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                <th className="px-3 py-2.5">Country</th>
                {SORT_COLUMNS.map((col) => (
                  <th key={col.key} className="px-3 py-2.5">
                    <SortableHeader
                      active={sortBy === col.key}
                      dir={sortOrder}
                      onClick={() => toggleSort(col.key)}
                    >
                      <span title={col.tooltip}>{col.label}</span>
                    </SortableHeader>
                  </th>
                ))}
                <th className="px-3 py-2.5">Top Plan</th>
                <th className="px-3 py-2.5">Top Industry</th>
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row) => {
                const flag = row.country_code ? flagEmojiFromIso(row.country_code) : '';
                return (
                  <tr key={`${row.country_code ?? 'na'}-${row.country_name}`} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80">
                    <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden>{flag || '🌐'}</span>
                        <span>{row.country_name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.visitors_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.registered_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                      {row.paid_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatUsd(row.revenue_total)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatRate(row.visitor_to_registered_rate)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatRate(row.registered_to_paid_rate)}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">{row.top_subscription_plan || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">{row.top_industry || 'Unknown'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {payload?.period?.label ? (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{payload.period.label}</p>
      ) : null}
    </AdminContentCard>
  );
}
