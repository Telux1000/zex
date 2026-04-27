export default function InvoicesPageLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="h-8 w-40 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="flex gap-2">
          <div className="h-10 w-24 rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div className="h-10 w-36 rounded-lg bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
      <div className="mt-6 space-y-4">
        <div className="sticky top-0 z-30 space-y-3 rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-950/90">
          <div className="flex gap-2">
            <div className="h-11 flex-1 rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-11 w-24 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-11 w-28 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 w-20 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="col-span-2 h-3 rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 border-b border-slate-50 px-4 py-4 last:border-0 dark:border-slate-800/80"
            >
              <div className="col-span-2 h-4 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="col-span-3 h-4 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="col-span-2 h-4 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="col-span-2 h-4 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="col-span-3 h-4 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
          <p className="border-t border-slate-100 px-4 py-3 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Loading invoices…
          </p>
        </div>
      </div>
    </div>
  );
}
