'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { GeoConversionInsightsCard } from '@/components/admin/GeoConversionInsightsCard';
import { ANALYTICS_DRILLDOWN } from '@/lib/admin/analytics-drilldown';
import { cn } from '@/lib/utils/cn';

type SubscriptionMixItem = {
  plan_key: string;
  plan_name: string;
  count: number;
  percentage: number;
};

type MetricWithTrend = {
  value: number;
  delta: number | null;
  previous: number | null;
};

type AttentionItem = {
  id: string;
  label: string;
  description: string;
  count: number;
  severity: 'neutral' | 'warning' | 'critical';
};

type AnalyticsPayload = {
  period: { label: string; days: number; compare_label: string };
  definitions: {
    active_accounts: string;
    active_users: string;
    mrr: string;
  };
  meta?: {
    activity_sample_capped?: boolean;
    ever_activity_sample_capped?: boolean;
    mrr_trend_available?: boolean;
    /** Actual snapshot day used for Δ (≤ lookback date). */
    mrr_trend_baseline_day_utc?: string;
    mrr_trend_lookback_day_utc?: string;
  };
  health: {
    active_accounts: MetricWithTrend;
    active_users: MetricWithTrend;
    mrr: MetricWithTrend;
    arr: MetricWithTrend;
  };
  attention: {
    inactive_threshold_days: number;
    items: AttentionItem[];
  };
  usage: {
    ai_usage_30d: MetricWithTrend;
    reminder_usage_30d: MetricWithTrend;
    scheduled_send_30d: MetricWithTrend;
  };
  revenue: {
    total_accounts: number;
    total_users: number;
    trial_subscription_mix: SubscriptionMixItem[];
    paid_subscription_mix: SubscriptionMixItem[];
    mrr: number;
    arr: number;
  };
  product_usage?: {
    sections: Array<{
      key: string;
      label: string;
      visits: number;
      visits_previous: number;
      delta: number;
      distinct_users: number;
      pct_of_profiles: number | null;
    }>;
    features: Array<{
      key: string;
      label: string;
      count: number;
      previous: number;
      delta: number;
    }>;
    meta: {
      page_views_capped: boolean;
      page_views_missing_table: boolean;
      profiles_denominator: number;
      feature_source: string;
    };
  };
};

function formatDelta(delta: number | null, opts?: { currency?: boolean }): { text: string; tone: 'up' | 'down' | 'flat' | 'none' } {
  if (delta === null) return { text: '—', tone: 'none' };
  if (delta === 0) return { text: '0', tone: 'flat' };
  const sign = delta > 0 ? '+' : '';
  const abs = Math.abs(delta);
  const text = opts?.currency
    ? `${sign}$${abs.toFixed(abs < 100 ? 2 : 0)}`
    : `${sign}${delta}`;
  return { text, tone: delta > 0 ? 'up' : 'down' };
}

function InlineDelta({ value }: { value: number }) {
  const { text, tone } = formatDelta(value, {});
  const cls =
    tone === 'flat'
      ? 'text-zinc-500'
      : tone === 'up'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-800 dark:text-amber-300';
  return <span className={cn('tabular-nums text-sm font-medium', cls)}>{text}</span>;
}

function TrendPill({
  delta,
  compareLabel,
  currency,
}: {
  delta: number | null;
  compareLabel: string;
  currency?: boolean;
}) {
  const { text, tone } = formatDelta(delta, { currency });
  if (tone === 'none') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-zinc-400"
        title="No UTC snapshot from ~30 days ago yet. Trends appear after the table has been populated that long."
      >
        <span className="tabular-nums">—</span>
        <span className="hidden sm:inline">{compareLabel}</span>
      </span>
    );
  }
  const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Activity;
  const color =
    tone === 'flat'
      ? 'text-zinc-500'
      : tone === 'up'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-700 dark:text-amber-400';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', color)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
      <span className="hidden font-normal text-zinc-400 sm:inline">{compareLabel}</span>
    </span>
  );
}

function DrilldownMetricTile({
  label,
  hint,
  value,
  metric,
  compareLabel,
  valueFormat,
  href,
  footerLink,
}: {
  label: string;
  hint?: string;
  value?: string | number;
  metric?: MetricWithTrend;
  compareLabel: string;
  valueFormat?: 'currency' | 'number';
  /** When set, entire card navigates (same pattern for all drill-down metrics). */
  href?: string;
  /** Optional text link when the card itself is not navigable (e.g. MRR/ARR). */
  footerLink?: { href: string; label: string };
}) {
  const display =
    value !== undefined
      ? valueFormat === 'currency'
        ? `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        : String(value)
      : metric === undefined
        ? '—'
        : valueFormat === 'currency'
          ? `$${Number(metric.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          : Number(metric.value).toLocaleString();

  const delta = metric?.delta ?? null;

  const shellClass = cn(
    'rounded-xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900/50',
    href &&
      'group min-h-[8.5rem] cursor-pointer touch-manipulation transition hover:border-zinc-300 hover:shadow-md active:brightness-[0.99] dark:hover:border-zinc-600'
  );

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      {hint ? (
        <p className="mt-0.5 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500" title={hint}>
          {hint}
        </p>
      ) : null}
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{display}</p>
      <div className="mt-2 flex min-h-[1.25rem] items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {metric ? (
            <TrendPill delta={delta} compareLabel={compareLabel} currency={valueFormat === 'currency'} />
          ) : null}
        </div>
        {href ? (
          <ChevronRight
            className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:group-hover:text-zinc-200"
            aria-hidden
          />
        ) : null}
      </div>
      {footerLink ? (
        <Link
          href={footerLink.href}
          className="mt-3 inline-flex text-xs font-medium text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
        >
          {footerLink.label}
        </Link>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={shellClass} prefetch={false}>
        {body}
      </Link>
    );
  }

  return <div className={shellClass}>{body}</div>;
}

function attentionDrillHref(itemId: string): string {
  switch (itemId) {
    case 'inactive_workspaces':
      return ANALYTICS_DRILLDOWN.accountsInactive30d;
    case 'past_due':
      return ANALYTICS_DRILLDOWN.billingPastDue;
    case 'trials_ending_soon':
      return ANALYTICS_DRILLDOWN.billingTrialingRenewal30d;
    case 'no_usage_ever':
      return ANALYTICS_DRILLDOWN.accountsNoUsage;
    default:
      return '/admin/accounts';
  }
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

function SubscriptionMixCard({
  title,
  emptyLabel,
  mixType,
  rows,
}: {
  title: string;
  emptyLabel: string;
  mixType: 'trial' | 'paid';
  rows: SubscriptionMixItem[];
}) {
  return (
    <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const pct = Math.max(0, Math.min(100, row.percentage));
            return (
              <li key={`${title}-${row.plan_key}`}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-zinc-800 dark:text-zinc-200">{row.plan_name}</span>
                  <span className={cn('tabular-nums', row.count > 0 ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-400')}>
                    {row.count.toLocaleString()} <span className="text-zinc-400">({row.percentage.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="mt-1">
                  <Link
                    href={`/admin/billing?plan=${encodeURIComponent(row.plan_key)}&segment=${mixType}`}
                    prefetch={false}
                    className="text-xs font-medium text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    View {row.plan_name} {mixType}
                  </Link>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-zinc-700 dark:bg-zinc-300" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type SectionSortKey = 'visits' | 'delta' | 'users' | 'pct' | 'label';
type FeatureSortKey = 'count' | 'delta' | 'label';

export function AdminAnalyticsPanel() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionSort, setSectionSort] = useState<SectionSortKey>('visits');
  const [sectionDir, setSectionDir] = useState<'asc' | 'desc'>('desc');
  const [featureSort, setFeatureSort] = useState<FeatureSortKey>('count');
  const [featureDir, setFeatureDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then(async (r) => {
        const json = (await r.json()) as { error?: string } & Partial<AnalyticsPayload>;
        if (!r.ok) {
          throw new Error(json.error ?? r.statusText ?? 'Failed to load analytics');
        }
        if (json.error) {
          throw new Error(json.error);
        }
        setData(json as AnalyticsPayload);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const pu = data?.product_usage;
  const sortedSections = useMemo(() => {
    if (!pu?.sections?.length) return [];
    const rows = [...pu.sections];
    const m = sectionDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sectionSort) {
        case 'visits':
          return (a.visits - b.visits) * m;
        case 'delta':
          return (a.delta - b.delta) * m;
        case 'users':
          return (a.distinct_users - b.distinct_users) * m;
        case 'pct':
          return ((a.pct_of_profiles ?? -1) - (b.pct_of_profiles ?? -1)) * m;
        case 'label':
          return a.label.localeCompare(b.label) * m;
        default:
          return 0;
      }
    });
    return rows;
  }, [pu, sectionSort, sectionDir]);

  const sortedFeatures = useMemo(() => {
    if (!pu?.features?.length) return [];
    const rows = [...pu.features];
    const m = featureDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (featureSort) {
        case 'count':
          return (a.count - b.count) * m;
        case 'delta':
          return (a.delta - b.delta) * m;
        case 'label':
          return a.label.localeCompare(b.label) * m;
        default:
          return 0;
      }
    });
    return rows;
  }, [pu, featureSort, featureDir]);

  function cycleSectionSort(key: SectionSortKey) {
    if (sectionSort === key) setSectionDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSectionSort(key);
      setSectionDir(key === 'label' ? 'asc' : 'desc');
    }
  }

  function cycleFeatureSort(key: FeatureSortKey) {
    if (featureSort === key) setFeatureDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setFeatureSort(key);
      setFeatureDir(key === 'label' ? 'asc' : 'desc');
    }
  }

  const sortHint = (key: SectionSortKey) => (sectionSort === key ? (sectionDir === 'asc' ? ' ↑' : ' ↓') : '');

  const featSortHint = (key: FeatureSortKey) =>
    featureSort === key ? (featureDir === 'asc' ? ' ↑' : ' ↓') : '';

  if (error) {
    return (
      <AdminContentCard className="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </AdminContentCard>
    );
  }

  if (loading || !data) {
    return (
      <AdminContentCard>
        <p className="text-sm text-zinc-500">Loading analytics…</p>
      </AdminContentCard>
    );
  }

  const compare = data.period.compare_label;
  const isEmptyPlatform = data.revenue.total_accounts === 0 && data.revenue.total_users === 0;
  const usageSum =
    data.usage.ai_usage_30d.value + data.usage.reminder_usage_30d.value + data.usage.scheduled_send_30d.value;
  const attentionTotal = data.attention.items.reduce((s, i) => s + (i.count > 0 ? 1 : 0), 0);

  if (isEmptyPlatform) {
    return (
      <AdminContentCard>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">No subscriber data yet</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Once workspaces and profiles exist, this dashboard shows adoption, estimated revenue, usage trends, and risk
          signals. Empty states avoid misleading zeros.
        </p>
      </AdminContentCard>
    );
  }

  return (
    <div className="space-y-8">
      {data.meta?.activity_sample_capped || data.meta?.ever_activity_sample_capped ? (
        <AdminContentCard className="border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Some activity rows were capped while scanning — counts are approximate. Consider a SQL rollup for very high
            volume.
          </p>
        </AdminContentCard>
      ) : null}

      {/* A. Health overview */}
      <AdminContentCard>
        <SectionTitle
          icon={BarChart3}
          title="Health overview"
          description={`${data.period.label} — platform pulse vs prior month-long window.`}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DrilldownMetricTile
            label="Active accounts (30d)"
            hint={data.definitions.active_accounts}
            metric={data.health.active_accounts}
            compareLabel={compare}
            href={ANALYTICS_DRILLDOWN.accountsActive30d}
          />
          <DrilldownMetricTile
            label="Active users (30d)"
            hint={data.definitions.active_users}
            metric={data.health.active_users}
            compareLabel={compare}
            href={ANALYTICS_DRILLDOWN.usersSignin30d}
          />
          <DrilldownMetricTile
            label="MRR (est.)"
            hint={data.definitions.mrr}
            metric={data.health.mrr}
            compareLabel={
              data.meta?.mrr_trend_available && data.meta.mrr_trend_baseline_day_utc
                ? `vs ${data.meta.mrr_trend_baseline_day_utc} snapshot`
                : 'vs ~30d snapshot (baseline pending)'
            }
            valueFormat="currency"
            footerLink={{ href: ANALYTICS_DRILLDOWN.billingOverview, label: 'View billing' }}
          />
          <DrilldownMetricTile
            label="ARR (est.)"
            hint="MRR × 12 from current plan mix."
            metric={data.health.arr}
            compareLabel={
              data.meta?.mrr_trend_available && data.meta.mrr_trend_baseline_day_utc
                ? `vs ${data.meta.mrr_trend_baseline_day_utc} snapshot`
                : 'vs ~30d snapshot (baseline pending)'
            }
            valueFormat="currency"
            footerLink={{ href: ANALYTICS_DRILLDOWN.billingOverview, label: 'View billing' }}
          />
        </div>
        {!data.meta?.mrr_trend_available ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            MRR/ARR change vs ~30 days ago unlocks after daily snapshots exist for that date (first visit each UTC day
            records today; allow ~30 days of history).
          </p>
        ) : null}
      </AdminContentCard>

      {/* B. Needs attention */}
      <AdminContentCard>
        <SectionTitle
          icon={AlertTriangle}
          title="Needs attention"
          description="Prioritized risk signals — use accounts and billing views to act."
        />
        {attentionTotal === 0 ? (
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            Nothing flagged right now — all checks below are clear.
          </p>
        ) : null}
        <ul className="divide-y divide-zinc-200/80 rounded-lg border border-zinc-200/90 dark:divide-zinc-800 dark:border-zinc-800">
          {data.attention.items.map((item) => (
            <li
              key={item.id}
              className={cn(
                item.severity === 'critical' && item.count > 0 && 'bg-red-50/50 dark:bg-red-950/20',
                item.severity === 'warning' && item.count > 0 && 'bg-amber-50/40 dark:bg-amber-950/15'
              )}
            >
              <Link
                href={attentionDrillHref(item.id)}
                prefetch={false}
                className="group flex min-h-[52px] touch-manipulation flex-col gap-1 px-4 py-3 transition hover:bg-zinc-50/90 active:bg-zinc-100/80 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-900/40 dark:active:bg-zinc-900/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{item.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{item.description}</p>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <p
                    className={cn(
                      'text-lg font-semibold tabular-nums',
                      item.count > 0 ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400 dark:text-zinc-500'
                    )}
                  >
                    {item.count.toLocaleString()}
                  </p>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </AdminContentCard>

      {/* C. Usage insights */}
      <AdminContentCard>
        <SectionTitle
          icon={Activity}
          title="Usage insights"
          description="Product actions in the same rolling window — compared to the prior period."
        />
        {usageSum === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-6 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No usage events in this window</p>
            <p className="mt-1 text-xs text-zinc-500">
              AI insights, reminders, and scheduled sends are all zero — adoption may be early or instrumentation may be
              off.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DrilldownMetricTile
              label="AI usage"
              metric={data.usage.ai_usage_30d}
              compareLabel={compare}
              href={ANALYTICS_DRILLDOWN.accountsUsageAi}
            />
            <DrilldownMetricTile
              label="Reminders sent"
              metric={data.usage.reminder_usage_30d}
              compareLabel={compare}
              href={ANALYTICS_DRILLDOWN.accountsUsageReminders}
            />
            <DrilldownMetricTile
              label="Scheduled sends"
              metric={data.usage.scheduled_send_30d}
              compareLabel={compare}
              href={ANALYTICS_DRILLDOWN.accountsUsageScheduled}
            />
          </div>
        )}
      </AdminContentCard>

      {/* Product usage (sections + features) */}
      {pu ? (
        <AdminContentCard>
          <SectionTitle
            icon={LayoutGrid}
            title="Product usage"
            description={`Where people spend time in the app vs prior ${data.period.days} days. Section visits are recorded client-side; features use activity data (not billing).`}
          />
          {pu.meta.page_views_missing_table ? (
            <p className="mb-4 rounded-lg border border-amber-200/90 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100">
              Run migration <code className="rounded bg-white/60 px-1 dark:bg-zinc-900">073_product_usage_events</code> to
              enable section visit tracking. Feature counts below still work.
            </p>
          ) : null}
          {pu.meta.page_views_capped ? (
            <p className="mb-4 text-xs text-amber-800 dark:text-amber-200">
              Section visit sample capped — totals may be slightly low at very high volume.
            </p>
          ) : null}

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Most visited sections</p>
          <p className="mb-3 text-xs text-zinc-500">
            % of profiles = distinct users who opened the section at least once /{' '}
            {pu.meta.profiles_denominator.toLocaleString()} profiles.
          </p>
          <div className="overflow-x-auto rounded-lg border border-zinc-200/90 dark:border-zinc-800">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="text-left hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => cycleSectionSort('label')}
                    >
                      Section{sortHint('label')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => cycleSectionSort('visits')}
                    >
                      Visits {data.period.days}d{sortHint('visits')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => cycleSectionSort('delta')}
                    >
                      Δ vs prior{sortHint('delta')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => cycleSectionSort('users')}
                    >
                      Distinct users{sortHint('users')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => cycleSectionSort('pct')}
                    >
                      % of profiles{sortHint('pct')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSections.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80"
                  >
                    <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">{row.label}</td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.visits.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <InlineDelta value={row.delta} />
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.distinct_users.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {row.pct_of_profiles !== null ? `${row.pct_of_profiles}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-zinc-500">Feature usage</p>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{pu.meta.feature_source}</p>
          <div className="overflow-x-auto rounded-lg border border-zinc-200/90 dark:border-zinc-800">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="text-left hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => cycleFeatureSort('label')}
                    >
                      Feature{featSortHint('label')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => cycleFeatureSort('count')}
                    >
                      Count {data.period.days}d{featSortHint('count')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      className="hover:text-zinc-900 dark:hover:text-zinc-100"
                      onClick={() => cycleFeatureSort('delta')}
                    >
                      Δ vs prior{featSortHint('delta')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right tabular-nums normal-case">Prior {data.period.days}d</th>
                </tr>
              </thead>
              <tbody>
                {sortedFeatures.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80"
                  >
                    <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">{row.label}</td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <InlineDelta value={row.delta} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {row.previous.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminContentCard>
      ) : null}

      <GeoConversionInsightsCard />

      {/* D. Revenue / subscription */}
      <AdminContentCard>
        <SectionTitle
          icon={CreditCard}
          title="Revenue & subscription"
          description="Workspace totals plus clear funnel split between trial plan mix and paid plan mix."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Totals</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600 dark:text-zinc-400">Total accounts</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  <Link
                    href="/admin/accounts"
                    prefetch={false}
                    className="rounded px-0.5 underline-offset-4 hover:underline"
                  >
                    {data.revenue.total_accounts.toLocaleString()}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600 dark:text-zinc-400">Profiles</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  <Link
                    href="/admin/users"
                    prefetch={false}
                    className="rounded px-0.5 underline-offset-4 hover:underline"
                  >
                    {data.revenue.total_users.toLocaleString()}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600 dark:text-zinc-400">MRR / ARR (est.)</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  ${data.revenue.mrr.toLocaleString()} / ${data.revenue.arr.toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
          <SubscriptionMixCard
            title="Trial Subscription Mix"
            emptyLabel="No trial subscription data for this period."
            mixType="trial"
            rows={data.revenue.trial_subscription_mix}
          />
          <SubscriptionMixCard
            title="Paid Subscription Mix"
            emptyLabel="No paid subscription data for this period."
            mixType="paid"
            rows={data.revenue.paid_subscription_mix}
          />
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Trial mix = profiles created in this period with trial status. Paid mix = profiles created in this period with paid-active status.
        </p>
      </AdminContentCard>
    </div>
  );
}
