'use client';

import Link from 'next/link';
import type { Customer } from '@/lib/database.types';
import { ActivitySection } from '@/components/activity/ActivitySection';
import type { AuditLogRow } from '@/lib/audit-log';
import { formatDisplayDate } from '@/lib/utils/date';

type Props = {
  customer: Customer;
  auditLogs: AuditLogRow[];
};

export function CustomerDetailClient({ customer, auditLogs }: Props) {
  const title = String(customer.company || customer.name || customer.account_number || 'Customer');

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 print:hidden">
        <Link href="/dashboard/customers" className="text-sm text-slate-500 hover:text-zenzex-600">
          ← Customers
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {customer.account_number ? (
          <p className="mt-1 font-mono text-sm text-slate-500 dark:text-slate-400">
            {customer.account_number}
          </p>
        ) : null}
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_minmax(260px,320px)] lg:items-start lg:gap-8 xl:gap-10">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Contact
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              {customer.email ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{customer.email}</dd>
                </div>
              ) : null}
              {customer.phone ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{customer.phone}</dd>
                </div>
              ) : null}
              {(customer.address_line1 || customer.city) && (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Address</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {[customer.address_line1, customer.address_line2, customer.city, customer.state, customer.postal_code, customer.country]
                      .filter(Boolean)
                      .join(', ')}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Customer since</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {customer.created_at ? formatDisplayDate(customer.created_at) : '—'}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href={`/dashboard/invoices/new?mode=form&customer_id=${customer.id}`}
                className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Create invoice
              </Link>
            </div>
          </section>
        </div>

        <aside className="mt-8 min-w-0 lg:mt-0">
          <ActivitySection
            logs={auditLogs}
            className="lg:sticky lg:top-24"
            emptyMessage="No activity recorded for this customer yet."
          />
        </aside>
      </div>
    </div>
  );
}
