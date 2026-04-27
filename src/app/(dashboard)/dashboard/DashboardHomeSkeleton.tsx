export function DashboardHomeSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="mb-6 h-20 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--card)]" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {['revenue', 'outstanding', 'overdue', 'health'].map((k) => (
          <div
            key={k}
            className="h-28 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3"
          />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <div className="h-48 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--card)]" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading revenue…</p>
          <div className="h-64 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--card)]" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading invoices…</p>
        </div>
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--card)]" />
          <div className="h-40 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--card)]" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading activity…</p>
        </div>
      </div>
    </div>
  );
}
