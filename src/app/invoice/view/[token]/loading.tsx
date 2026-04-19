export default function PublicInvoiceLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-6">
          <div className="flex justify-between border-b border-slate-200 pb-8 dark:border-slate-800">
            <div className="h-12 w-32 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-2 text-right">
              <div className="ml-auto h-8 w-40 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="ml-auto h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
          <div className="h-24 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <div className="h-64 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        </div>
        <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading invoice…</p>
      </div>
    </div>
  );
}
