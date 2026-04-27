'use client';

import { ActivitySection } from '@/components/activity/ActivitySection';
import type { AuditLogRow } from '@/lib/audit-log';

type Props = {
  logs: AuditLogRow[];
  className?: string;
  /** When true, activity is still being loaded (deferred first paint). */
  isLoading?: boolean;
};

export function InvoiceActivitySection({ logs, className, isLoading = false }: Props) {
  if (isLoading) {
    return (
      <section className={`print:hidden ${className ?? ''}`}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Activity
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading activity…</p>
      </section>
    );
  }
  return <ActivitySection logs={logs} className={className} />;
}
