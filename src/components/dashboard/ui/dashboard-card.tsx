import { cn } from '@/lib/utils/cn';

export function DashboardCard({
  className,
  children,
  padding = true,
}: {
  className?: string;
  children: React.ReactNode;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm shadow-slate-900/[0.03] transition-shadow hover:shadow-md hover:shadow-indigo-950/[0.04] dark:shadow-black/20 dark:hover:shadow-black/40',
        padding && 'p-5',
        className
      )}
    >
      {children}
    </div>
  );
}
