import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';
import type { ActivityFeedItem } from '@/lib/activity/feed';
import { formatDisplayDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { DashboardCard } from '@/components/dashboard/ui/dashboard-card';

export function DashboardActivityCard({
  items,
  viewAllHref,
  className,
  periodSubtitle,
}: {
  items: ActivityFeedItem[];
  viewAllHref: string;
  className?: string;
  /** When set, clarifies activity matches the dashboard date filter. */
  periodSubtitle?: string;
}) {
  return (
    <DashboardCard
      className={cn(
        'flex h-full min-h-0 flex-col border-slate-200/80 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-900/30 sm:p-5 lg:col-span-1',
        className
      )}
    >
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          <Activity className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Activity</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-500">
            {periodSubtitle ?? 'Recent events'}
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="grow text-sm text-slate-500 dark:text-slate-400">No recent activity.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex gap-3 rounded-lg border border-slate-200/70 bg-white/90 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-900/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {item.eventType}
                  </span>
                  <time
                    className="text-[10px] text-slate-400 dark:text-slate-500"
                    dateTime={item.timestamp}
                    title={formatDisplayDate(item.timestamp)}
                  >
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </time>
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
                ) : null}
                {item.href ? (
                  <Link
                    href={item.href}
                    className="mt-1 inline-block text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    View
                  </Link>
                ) : null}
              </div>
              <span
                className={cn(
                  'mt-1 h-2 w-2 shrink-0 rounded-full',
                  item.severity === 'success' && 'bg-emerald-500',
                  item.severity === 'warning' && 'bg-amber-500',
                  (!item.severity || item.severity === 'neutral') && 'bg-slate-300 dark:bg-slate-600'
                )}
                aria-hidden
              />
            </li>
          ))}
        </ul>
      )}
      <Link
        href={viewAllHref}
        className="mt-3 shrink-0 text-xs font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
      >
        View all activity →
      </Link>
    </DashboardCard>
  );
}
