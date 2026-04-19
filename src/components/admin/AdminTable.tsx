import { cn } from '@/lib/utils/cn';

export function AdminTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950',
        className
      )}
    >
      <table className="w-full border-collapse text-left text-sm text-zinc-800 dark:text-zinc-200">{children}</table>
    </div>
  );
}

export function AdminTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-zinc-200 bg-zinc-50/90 dark:border-zinc-800 dark:bg-zinc-900/60">{children}</tr>
    </thead>
  );
}

export function AdminTh({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500 first:pl-4 last:pr-4 dark:text-zinc-400',
        className
      )}
    >
      {children}
    </th>
  );
}

export function AdminTr({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={cn('border-b border-zinc-100 transition-colors hover:bg-zinc-50/80 dark:border-zinc-800/80 dark:hover:bg-zinc-900/40', className)}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function AdminTd({
  children,
  className,
  colSpan,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      className={cn('px-3 py-2.5 align-middle text-sm first:pl-4 last:pr-4', className)}
    >
      {children}
    </td>
  );
}
