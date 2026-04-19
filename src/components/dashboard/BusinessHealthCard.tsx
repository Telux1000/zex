import { DashboardCard } from '@/components/dashboard/ui/dashboard-card';
type HealthLabel = 'Healthy' | 'Stable' | 'At Risk' | 'Critical';

type Props = {
  score: number;
  label: HealthLabel;
  summary: string;
  /** Explains what the score uses vs. what is current snapshot (e.g. open invoices). */
  periodScope?: string;
};

export function BusinessHealthCard({ score, label, summary, periodScope }: Props) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const isHealthy = label === 'Healthy';
  const isStable = label === 'Stable';
  const isCritical = label === 'Critical';

  return (
    <DashboardCard className="group relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-indigo-200/35 p-2.5 shadow-sm shadow-indigo-950/[0.04] transition-shadow duration-300 hover:shadow-md hover:shadow-indigo-500/[0.06] dark:border-indigo-500/15 dark:shadow-black/20 dark:hover:shadow-indigo-950/40 sm:p-3.5">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-indigo-50/40 to-violet-50/30 dark:from-slate-950 dark:via-indigo-950/35 dark:to-slate-900"
        aria-hidden
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-1.5 sm:gap-2">
          <p className="min-w-0 text-[10px] font-medium uppercase leading-none tracking-wide text-slate-500 dark:text-slate-400 sm:text-[11px]">
            Business Health
          </p>
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide sm:gap-1 sm:px-2 sm:text-[9px] ${
              isHealthy
                ? 'border border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                : isStable
                  ? 'border border-indigo-200/90 bg-indigo-50 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200'
                  : isCritical
                    ? 'border border-red-300/90 bg-red-100 text-red-900 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-100'
                    : 'border border-amber-200/90 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
            }`}
          >
            <span
              className={`h-1 w-1 rounded-full ${
                isHealthy
                  ? 'bg-emerald-500 dark:bg-emerald-400'
                  : isStable
                    ? 'bg-indigo-500 dark:bg-indigo-400'
                    : isCritical
                      ? 'bg-red-600 dark:bg-red-400'
                      : 'bg-amber-500 dark:bg-amber-400'
              }`}
              aria-hidden
            />
            {label}
          </span>
        </div>

        <p className="mt-1 flex items-baseline gap-0.5 tabular-nums leading-tight tracking-tight text-slate-900 dark:text-white">
          <span className="text-base font-semibold sm:text-[1.35rem]">{safeScore}</span>
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 sm:text-xs">/100</span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-600 dark:text-slate-400 sm:mt-1 sm:text-[11px]">
          {summary}
        </p>
        {periodScope ? (
          <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-slate-500 dark:text-slate-500 sm:text-[10px]">
            {periodScope}
          </p>
        ) : null}

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-500 via-indigo-500 to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${safeScore}%` }}
          />
        </div>

      </div>
    </DashboardCard>
  );
}
