import { cn } from '@/lib/utils/cn';

export function AdminContentCard({
  children,
  className,
  padding = 'p-5',
}: {
  children: React.ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950',
        padding,
        className
      )}
    >
      {children}
    </section>
  );
}
