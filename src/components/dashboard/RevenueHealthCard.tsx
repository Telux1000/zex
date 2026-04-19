import { useId } from 'react';
import { DashboardCard } from '@/components/dashboard/ui/dashboard-card';

type Props = {
  score: number;
  label: 'At risk' | 'Stable' | 'Healthy';
  summary: string;
};

export function RevenueHealthCard({ score, label, summary }: Props) {
  const gradId = useId().replace(/:/g, '');
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const isHealthy = label === 'Healthy';
  const isStable = label === 'Stable';

  return (
    <DashboardCard className="group relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-indigo-200/35 p-2.5 shadow-sm shadow-indigo-950/[0.04] transition-shadow duration-300 hover:shadow-md hover:shadow-indigo-500/[0.06] dark:border-indigo-500/15 dark:shadow-black/20 dark:hover:shadow-indigo-950/40 sm:p-3.5">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-indigo-50/50 to-violet-50/40 dark:from-slate-950 dark:via-indigo-950/40 dark:to-slate-900"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-8 top-0 h-16 w-24 rounded-full bg-indigo-400/10 blur-2xl dark:bg-indigo-500/15"
        aria-hidden
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-1.5 sm:gap-2">
          <p className="min-w-0 text-[10px] font-medium uppercase leading-none tracking-wide text-slate-500 dark:text-slate-400 sm:text-[11px]">
            Revenue Health
          </p>
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide sm:gap-1 sm:px-2 sm:text-[9px] ${
              isHealthy
                ? 'border border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                : isStable
                  ? 'border border-indigo-200/90 bg-indigo-50 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200'
                  : 'border border-amber-200/90 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
            }`}
          >
            <span
              className={`h-1 w-1 rounded-full ${
                isHealthy
                  ? 'bg-emerald-500 dark:bg-emerald-400'
                  : isStable
                    ? 'bg-indigo-500 dark:bg-indigo-400'
                    : 'bg-amber-500 dark:bg-amber-400'
              }`}
              aria-hidden
            />
            {label}
          </span>
        </div>

        <p className="mt-1 flex items-baseline gap-0.5 tabular-nums leading-tight tracking-tight text-slate-900 dark:text-white">
          <span className="text-base font-semibold sm:text-[1.35rem]">{safeScore}</span>
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 sm:text-xs">
            /100
          </span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-600 dark:text-slate-400 sm:mt-1 sm:text-[11px]">
          {summary}
        </p>

        <div className="mt-auto min-h-0 pt-2 sm:pt-2.5">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200/90 ring-1 ring-inset ring-slate-300/40 dark:bg-slate-800/90 dark:ring-slate-600/40">
            <div
              className="absolute inset-y-0 left-0 w-1/3 border-r border-white/50 dark:border-slate-900/40"
              aria-hidden
            />
            <div
              className="absolute inset-y-0 left-1/3 w-1/3 border-r border-white/50 dark:border-slate-900/40"
              aria-hidden
            />
            <div
              className="absolute inset-0 opacity-30 dark:opacity-25"
              style={{
                background:
                  'linear-gradient(90deg, rgb(251 191 36 / 0.35) 0%, rgb(251 191 36 / 0.35) 33.33%, rgb(99 102 241 / 0.25) 33.33%, rgb(99 102 241 / 0.25) 66.66%, rgb(16 185 129 / 0.3) 66.66%, rgb(16 185 129 / 0.3) 100%)',
              }}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 left-0 overflow-hidden rounded-l-full rounded-r-sm transition-[width] duration-500 ease-out"
              style={{ width: `${safeScore}%` }}
            >
              <svg
                className="h-full w-full"
                preserveAspectRatio="none"
                viewBox="0 0 100 4"
                aria-hidden
              >
                <defs>
                  <linearGradient
                    id={`rh-fill-${gradId}`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <rect
                  width="100"
                  height="4"
                  fill={`url(#rh-fill-${gradId})`}
                  rx="2"
                />
              </svg>
            </div>
            <div
              className="absolute top-1/2 z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-500/90 dark:bg-slate-100 dark:shadow-[0_0_12px_rgba(129,140,248,0.45)] dark:ring-indigo-400"
              style={{ left: `${safeScore}%` }}
              aria-hidden
            />
          </div>
          <div className="mt-1 flex justify-between gap-0.5 text-[8px] font-medium uppercase leading-tight tracking-wide text-slate-400 dark:text-slate-500 sm:gap-1 sm:text-[9px]">
            <span className="w-1/3 text-left">At risk</span>
            <span className="w-1/3 text-center">Stable</span>
            <span className="w-1/3 text-right text-emerald-600/90 dark:text-emerald-400/90">
              Healthy
            </span>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}
