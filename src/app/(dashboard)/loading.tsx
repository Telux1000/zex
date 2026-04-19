export default function DashboardSegmentLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-4 px-1">
      <div className="h-9 w-44 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="h-4 w-full max-w-md rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-6 h-56 rounded-xl bg-slate-200 dark:bg-slate-800 sm:h-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
