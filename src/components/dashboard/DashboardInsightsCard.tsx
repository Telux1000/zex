import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Info, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { FinancialInsight } from '@/lib/insights/generate';
import { DashboardCard } from '@/components/dashboard/ui/dashboard-card';

export function DashboardInsightsCard({
  insights,
  viewAllHref,
  className,
}: {
  insights: FinancialInsight[];
  viewAllHref: string;
  className?: string;
}) {
  return (
    <DashboardCard className={cn('flex h-full min-h-0 flex-col p-4 sm:p-5 lg:col-span-1', className)}>
      <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-200/60 bg-indigo-50 text-indigo-600 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Insights</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Analysis &amp; recommendations</p>
          </div>
        </div>
      </div>
      {insights.length === 0 ? (
        <p className="min-h-0 grow text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          No new insights yet. Add invoices, payments, and expenses to unlock tailored guidance.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
          {insights.map((ins) => {
            const Icon =
              ins.type === 'warning'
                ? AlertTriangle
                : ins.type === 'opportunity'
                  ? Lightbulb
                  : Info;
            const ring =
              ins.type === 'warning'
                ? 'border-amber-200/90 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/25'
                : ins.type === 'opportunity'
                  ? 'border-emerald-200/90 bg-emerald-50/70 dark:border-emerald-800/40 dark:bg-emerald-950/20'
                  : 'border-slate-200/90 bg-slate-50/80 dark:border-slate-700/80 dark:bg-slate-800/40';
            const iconClass =
              ins.type === 'warning'
                ? 'text-amber-600 dark:text-amber-400'
                : ins.type === 'opportunity'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400';
            return (
              <li
                key={ins.id}
                className={cn('rounded-xl border p-3 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20', ring)}
              >
                <div className="flex gap-2.5">
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)} strokeWidth={2} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{ins.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{ins.message}</p>
                    {ins.actionHref && ins.actionLabel ? (
                      <Link
                        href={ins.actionHref}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                      >
                        {ins.actionLabel}
                        <ArrowUpRight className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={viewAllHref}
        className="mt-3 shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
      >
        Open insights →
      </Link>
    </DashboardCard>
  );
}
