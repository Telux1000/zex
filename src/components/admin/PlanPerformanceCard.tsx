'use client';

import { useEffect, useState } from 'react';
import { LineChart } from 'lucide-react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { cn } from '@/lib/utils/cn';

type SortBy = 'plan_name' | 'paid_customers_count' | 'revenue_total' | 'trial_to_paid_conversion_rate';

type PlanRow = {
  plan_key: string;
  plan_name: string;
  paid_customers_count: number;
  revenue_total: number;
  trial_to_paid_conversion_rate: number;
};

type PlanPerformancePayload = {
  period: { label: string; days: number };
  plans: PlanRow[];
};

const RANGE_OPTIONS = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
] as const;

function formatRate(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function PlanPerformanceCard({
  selectedDays,
  onDaysChange,
}: {
  selectedDays?: number;
  onDaysChange?: (days: number) => void;
}) {
  const [localDays, setLocalDays] = useState<number>(30);
  const days = selectedDays ?? localDays;
  const [sortBy, setSortBy] = useState<SortBy>('revenue_total');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlanPerformancePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      days: String(days),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    fetch(`/api/admin/analytics/plan-performance?${params.toString()}`)
      .then(async (res) => {
        const json = (await res.json()) as Partial<PlanPerformancePayload> & { error?: string };
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        if (json.error) throw new Error(json.error);
        if (!cancelled) setData(json as PlanPerformancePayload);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load plan performance data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, sortBy, sortOrder]);

  function toggleSort(next: SortBy) {
    if (sortBy === next) {
      setSortOrder((d) => (d === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortBy(next);
    setSortOrder(next === 'plan_name' ? 'asc' : 'desc');
  }

  const sortHint = (key: SortBy) => (sortBy === key ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <AdminContentCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <LineChart className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Plan Performance</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Compare plan conversion, adoption, and revenue performance.
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
        <div className="h-36 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/25 dark:text-red-300">
          Unable to load plan performance data.
        </div>
      ) : !data?.plans?.length ? (
        <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          No plan performance data available for this period.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200/90 dark:border-zinc-800">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <th className="px-3 py-2.5">
                    <button type="button" className="hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => toggleSort('plan_name')}>
                      Plan{sortHint('plan_name')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button type="button" className="hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => toggleSort('paid_customers_count')}>
                      Paid Customers{sortHint('paid_customers_count')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button type="button" className="hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => toggleSort('revenue_total')}>
                      Revenue{sortHint('revenue_total')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => toggleSort('trial_to_paid_conversion_rate')}
                    >
                      Trial → Paid %{sortHint('trial_to_paid_conversion_rate')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.plans.map((row) => (
                  <tr key={row.plan_key} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80">
                    <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{row.plan_name}</td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.paid_customers_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatUsd(row.revenue_total)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatRate(row.trial_to_paid_conversion_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.period?.label ? <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{data.period.label}</p> : null}
        </>
      )}
    </AdminContentCard>
  );
}
