'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { cn } from '@/lib/utils/cn';

type FunnelPayload = {
  period: { label: string; days: number };
  visitors_count: number;
  signups_count: number;
  trial_count: number;
  paid_count: number;
  visitor_to_signup_rate: number;
  signup_to_trial_rate: number;
  trial_to_paid_rate: number;
  visitor_to_paid_rate: number;
};

type FunnelStep = {
  label: 'Visitors' | 'Signups' | 'Trial' | 'Paid';
  count: number;
  stageKey: 'visitors' | 'signups' | 'trial' | 'paid';
};

const RANGE_OPTIONS = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
] as const;

function fmtRate(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

export function ConversionFunnelCard({
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
  const [data, setData] = useState<FunnelPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/analytics/conversion-funnel?days=${days}`)
      .then(async (res) => {
        const json = (await res.json()) as Partial<FunnelPayload> & { error?: string };
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        if (json.error) throw new Error(json.error);
        if (!cancelled) setData(json as FunnelPayload);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load conversion funnel data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const steps = useMemo<FunnelStep[]>(() => {
    if (!data) return [];
    return [
      { label: 'Visitors', count: data.visitors_count, stageKey: 'visitors' },
      { label: 'Signups', count: data.signups_count, stageKey: 'signups' },
      { label: 'Trial', count: data.trial_count, stageKey: 'trial' },
      { label: 'Paid', count: data.paid_count, stageKey: 'paid' },
    ];
  }, [data]);

  const conversions = useMemo(() => {
    if (!data) return [];
    return [data.visitor_to_signup_rate, data.signup_to_trial_rate, data.trial_to_paid_rate];
  }, [data]);

  const largestDropIdx = useMemo(() => {
    if (conversions.length !== 3) return -1;
    let maxDrop = -1;
    let idx = -1;
    for (let i = 0; i < conversions.length; i++) {
      const drop = 100 - conversions[i]!;
      if (drop > maxDrop) {
        maxDrop = drop;
        idx = i;
      }
    }
    return idx;
  }, [conversions]);

  return (
    <AdminContentCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <TrendingUp className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Conversion Funnel</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Track how visitors move from landing to paid subscription.
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
        <div className="animate-pulse space-y-3">
          <div className="h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/25 dark:text-red-300">
          Unable to load conversion funnel data.
        </div>
      ) : !data || (data.visitors_count === 0 && data.signups_count === 0 && data.trial_count === 0 && data.paid_count === 0) ? (
        <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          No funnel data available for this period.
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={step.stageKey}>
              <div className="rounded-lg border border-zinc-200/90 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{step.label}</span>
                  <span className="text-xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
                    {step.count.toLocaleString()}
                  </span>
                </div>
              </div>
              {idx < conversions.length ? (
                <div
                  className={cn(
                    'px-1 py-1 text-center text-xs tabular-nums',
                    idx === largestDropIdx
                      ? 'font-semibold text-amber-700 dark:text-amber-300'
                      : 'text-zinc-500 dark:text-zinc-400'
                  )}
                  title={idx === largestDropIdx ? 'Largest funnel drop-off in this period.' : undefined}
                >
                  ↓ {fmtRate(conversions[idx]!)}
                </div>
              ) : null}
            </div>
          ))}
          <p className="pt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Overall visitor→paid: {fmtRate(data.visitor_to_paid_rate)}{data.period?.label ? ` (${data.period.label})` : ''}
          </p>
        </div>
      )}
    </AdminContentCard>
  );
}
