'use client';

import Link from 'next/link';
import { FileText, Receipt, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useDashboardAccess, useHasCustomer } from '@/contexts/DashboardAccessContext';

const cardClassName = cn(
  'group flex min-h-[100px] min-w-0 flex-col items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center shadow-sm shadow-slate-900/[0.03] transition-all duration-200 sm:min-h-[120px] sm:p-4 md:min-h-[11rem] md:p-8 xl:min-h-[13rem] xl:px-9 xl:py-10',
  'hover:-translate-y-0.5 hover:border-indigo-300/55 hover:shadow-md hover:shadow-indigo-500/[0.08] active:scale-[0.98]',
  'dark:shadow-black/25 dark:hover:border-indigo-500/30 dark:hover:shadow-indigo-950/50'
);

const iconWrapClassName = cn(
  'mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50 text-indigo-600 transition-colors sm:mb-2.5 sm:h-11 sm:w-11 md:mb-4 md:h-14 md:w-14 md:rounded-2xl xl:mb-5 xl:h-16 xl:w-16',
  'group-hover:border-indigo-300 group-hover:bg-indigo-100 group-hover:text-indigo-700',
  'dark:border-indigo-500/25 dark:bg-indigo-950/45 dark:text-indigo-300',
  'dark:group-hover:border-indigo-400/35 dark:group-hover:bg-indigo-900/50 dark:group-hover:text-indigo-200'
);

const titleClassName =
  'text-center text-sm font-semibold leading-snug text-slate-900 text-balance sm:text-base md:text-base xl:text-lg dark:text-white';

type Perm = 'customer' | 'invoice' | 'quote' | 'expense';

type LinkAction = {
  kind: 'link';
  key: string;
  href: string;
  title: string;
  Icon: LucideIcon;
  perm: Perm;
};

type InvoiceHubAction = {
  kind: 'invoice-hub';
  key: string;
  perm: 'invoice';
  Icon: LucideIcon;
};

const createActions: (LinkAction | InvoiceHubAction)[] = [
  {
    kind: 'link',
    key: 'customer',
    href: '/dashboard/customers?add=1',
    title: 'Add customer',
    Icon: Users,
    perm: 'customer',
  },
  {
    kind: 'invoice-hub',
    key: 'invoice',
    perm: 'invoice',
    Icon: Receipt,
  },
  {
    kind: 'link',
    key: 'quote',
    href: '/dashboard/quotes/new',
    title: 'Create Quote',
    Icon: FileText,
    perm: 'quote',
  },
  {
    kind: 'link',
    key: 'expense',
    href: '/dashboard/expenses',
    title: 'Create Expenses',
    Icon: Wallet,
    perm: 'expense',
  },
];

export default function CreatePage() {
  const f = useDashboardAccess();
  const hasCustomer = useHasCustomer();
  const visible = createActions.filter((a) => {
    if (a.perm === 'customer') return f.createCustomer;
    if (a.perm === 'invoice' || a.perm === 'quote') return f.createInvoice;
    if (a.perm === 'expense') return f.showExpensesWrite;
    return false;
  });

  if (visible.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 sm:space-y-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl md:text-3xl">
          Create
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          You don&apos;t have permission to create records. Contact an admin if you need access.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 sm:space-y-8">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl md:text-3xl">
        What do you want to do?
      </h1>

      <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3 md:gap-4 xl:grid-cols-4 xl:gap-5">
        {visible.map((a) => {
          if (a.kind === 'invoice-hub') {
            const Icon = a.Icon;
            const invoiceHref = hasCustomer
              ? '/dashboard/invoices/new'
              : '/dashboard/customers?add=1&return_to=/dashboard/invoices/new';
            const invoiceTitle = hasCustomer ? 'Create invoice' : 'Add customer first';
            return (
              <Link
                key={a.key}
                href={invoiceHref}
                className={cn(
                  cardClassName,
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]'
                )}
              >
                <span className={iconWrapClassName} aria-hidden>
                  <Icon className="h-5 w-5 md:h-7 md:w-7 xl:h-8 xl:h-8" strokeWidth={1.75} />
                </span>
                <span className={titleClassName}>{invoiceTitle}</span>
              </Link>
            );
          }

          const { href, title, Icon } = a;
          return (
            <Link
              key={a.key}
              href={href}
              className={cn(
                cardClassName,
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]'
              )}
            >
              <span className={iconWrapClassName} aria-hidden>
                <Icon className="h-5 w-5 md:h-7 md:w-7 xl:h-8 xl:w-8" strokeWidth={1.75} />
              </span>
              <span className={titleClassName}>{title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
