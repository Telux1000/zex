'use client';

import { format, parseISO } from 'date-fns';
import { formatAuditLog, type AuditLogRow } from '@/lib/audit-log';

type Props = {
  logs: AuditLogRow[];
  className?: string;
  emptyMessage?: string;
};

function ActivityMeta({ row }: { row: AuditLogRow }) {
  const userLabel = row.actor_display_label ?? row.performed_by_name;
  const source = row.actor_source_label ?? 'Workspace';
  const when = format(parseISO(row.created_at), 'MMM d, yyyy · h:mm a');
  const tip = row.actor_display_tooltip;

  return (
    <>
      {/* Mobile: stack for readability; avoid horizontal overflow */}
      <div className="mt-2 flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-400 sm:hidden">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span title={tip ?? undefined} className="min-w-0 max-w-full cursor-default break-words font-medium text-slate-700 dark:text-slate-300">
            {userLabel}
          </span>
          <span className="shrink-0 text-slate-400" aria-hidden>
            ·
          </span>
          <span className="shrink-0 text-slate-600 dark:text-slate-400">{source}</span>
        </div>
        <time
          dateTime={row.created_at}
          className="text-[0.8125rem] tabular-nums leading-snug text-slate-500 dark:text-slate-500"
        >
          {when}
        </time>
      </div>

      {/* sm+: single line with pipes */}
      <p className="mt-1.5 hidden text-xs text-slate-600 dark:text-slate-400 sm:block">
        <span title={tip ?? undefined} className="cursor-default text-slate-600 dark:text-slate-300">
          {userLabel}
        </span>
        <span className="text-slate-400 dark:text-slate-500"> | </span>
        <span>{source}</span>
        <span className="text-slate-400 dark:text-slate-500"> | </span>
        <time dateTime={row.created_at} className="tabular-nums">
          {when}
        </time>
      </p>
    </>
  );
}

export function ActivitySection({
  logs,
  className = '',
  emptyMessage = 'No activity yet.',
}: Props) {
  return (
    <section className={`print:hidden ${className}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Activity
      </h2>
      {!logs.length ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{emptyMessage}</p>
      ) : (
        <ul className="max-h-[min(70vh,32rem)] min-h-0 space-y-3 overflow-y-auto overscroll-y-contain pr-0.5 [-webkit-overflow-scrolling:touch] sm:space-y-4 lg:max-h-[min(80vh,36rem)]">
          {logs.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-slate-200/90 bg-white p-3 shadow-sm last:pb-3 dark:border-slate-800 dark:bg-slate-900/30 sm:border-0 sm:border-b sm:border-slate-100 sm:bg-transparent sm:p-0 sm:pb-4 sm:shadow-none dark:sm:border-slate-800"
            >
              <p className="min-w-0 break-words text-[0.9375rem] leading-snug text-slate-900 dark:text-slate-100 sm:text-sm">
                {formatAuditLog(row, { audience: 'subscriber' })}
              </p>
              <ActivityMeta row={row} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
