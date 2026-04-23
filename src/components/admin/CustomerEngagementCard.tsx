'use client';

import { useEffect, useState } from 'react';
import { Users2 } from 'lucide-react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { cn } from '@/lib/utils/cn';

type EngagementPayload = {
  period: { label: string; days: number };
  active_customers_count: number;
  highly_engaged_customers_count: number;
  at_risk_customers_count: number;
  average_engagement_frequency: number;
  repeat_usage_rate: number;
};

const RANGE_OPTIONS = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
] as const;

function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200/90 bg-zinc-50/60 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-400">{hint}</p> : null}
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

export function CustomerEngagementCard({
  selectedDays,
  onDaysChange,
}: {
  selectedDays?: number;
  onDaysChange?: (days: number) => void;
}) {
  const [localDays, setLocalDays] = useState<number>(30);
  const days = selectedDays ?? localDays;
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EngagementPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/analytics/customer-engagement?days=${days}`)
      .then(async (res) => {
        const json = (await res.json()) as Partial<EngagementPayload> & { error?: string };
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        if (json.error) throw new Error(json.error);
        if (!cancelled) setData(json as EngagementPayload);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load customer quality and engagement data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <AdminContentCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <Users2 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Customer Quality / Engagement</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Track customer usage health and identify high-value or at-risk accounts.
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/25 dark:text-red-300">
          Unable to load customer quality and engagement data.
        </div>
      ) : !data ||
        (data.active_customers_count === 0 &&
          data.highly_engaged_customers_count === 0 &&
          data.at_risk_customers_count === 0) ? (
        <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          No customer engagement data available for this period.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="Active Customers" value={data.active_customers_count.toLocaleString()} />
            <MetricTile label="Highly Engaged" value={data.highly_engaged_customers_count.toLocaleString()} />
            <MetricTile label="At-Risk Customers" value={data.at_risk_customers_count.toLocaleString()} />
            <MetricTile
              label="Avg Engagement Frequency"
              hint="Key actions / active customer"
              value={data.average_engagement_frequency.toFixed(2)}
            />
            <MetricTile label="Repeat Usage Rate" value={`${data.repeat_usage_rate.toFixed(1)}%`} />
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{data.period.label}</p>
        </>
      )}
    </AdminContentCard>
  );
}
