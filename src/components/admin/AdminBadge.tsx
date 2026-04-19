import { cn } from '@/lib/utils/cn';

export type AdminBadgeTone = 'active' | 'pending' | 'suspended' | 'trialing' | 'revoked' | 'failed' | 'resolved' | 'open' | 'neutral' | 'warning';

const toneClass: Record<AdminBadgeTone, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-600/10 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20',
  pending: 'bg-amber-50 text-amber-900 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/20',
  suspended: 'bg-zinc-100 text-zinc-700 ring-zinc-500/15 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-500/20',
  trialing: 'bg-sky-50 text-sky-900 ring-sky-600/15 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-500/20',
  revoked: 'bg-zinc-100 text-zinc-600 ring-zinc-500/15 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-500/20',
  failed: 'bg-red-50 text-red-800 ring-red-600/15 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/20',
  resolved: 'bg-emerald-50 text-emerald-800 ring-emerald-600/10 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20',
  open: 'bg-indigo-50 text-indigo-900 ring-indigo-600/15 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-500/20',
  neutral: 'bg-zinc-50 text-zinc-700 ring-zinc-500/10 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-600/20',
  warning: 'bg-amber-50 text-amber-900 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/20',
};

export function AdminBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: AdminBadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        toneClass[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
