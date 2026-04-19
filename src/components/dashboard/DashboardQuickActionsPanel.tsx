'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { DashboardCard } from '@/components/dashboard/ui/dashboard-card';

export type DashboardTaskItem = {
  id: string;
  label: string;
  href: string;
};

export function DashboardQuickActionsPanel({
  tasks,
  activity,
  className,
}: {
  tasks: DashboardTaskItem[];
  activity?: string[];
  className?: string;
}) {
  const taskItems = tasks.slice(0, 10);
  const activityItems = activity?.slice(0, 3) ?? [];
  return (
    <DashboardCard className={cn('flex h-full min-h-0 flex-col p-4 sm:p-5', className)}>
      <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Today&apos;s Tasks
      </h3>
      <ul className="mt-2 shrink-0 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
        {taskItems.map((t) => (
          <li key={t.id} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
            <Link
              href={t.href}
              className="text-slate-700 transition-colors hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-300"
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
      {activityItems.length > 0 ? (
        <>
          <hr className="my-4 shrink-0 border-[var(--card-border)] opacity-70" />
          <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500/90 dark:text-slate-400/90">
            Activity
          </h3>
          <ul className="mt-2 min-h-0 flex-1 space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            {activityItems.map((t) => (
              <li key={`activity-${t}`} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                {t}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </DashboardCard>
  );
}
