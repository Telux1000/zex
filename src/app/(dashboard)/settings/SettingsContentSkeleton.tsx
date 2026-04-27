export function SettingsContentSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div
        className="hidden h-full min-h-[640px] w-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/40 lg:block"
        aria-hidden
      />
      <div className="space-y-4 lg:px-6 lg:py-1">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/40" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading settings…</p>
      </div>
    </div>
  );
}
