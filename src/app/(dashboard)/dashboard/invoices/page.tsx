import Link from 'next/link';
import { Suspense } from 'react';
import { InvoicesSection } from '@/components/invoices/InvoicesSection';
import {
  getPrimaryBusinessForUser,
  getServerSupabaseUser,
} from '@/lib/supabase/server-auth';

export default async function InvoicesPage() {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-400">Create a business first.</p>
        <Link href="/onboarding" className="mt-2 inline-block text-zenzex-600 hover:underline">
          Onboarding
        </Link>
      </div>
    );
  }

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, company')
    .eq('business_id', business.id)
    .order('company');

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    pending: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200',
    sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    viewed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    partially_paid:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    paid: 'bg-zenzex-100 text-zenzex-800 dark:bg-zenzex-900/50 dark:text-zenzex-300',
    partially_refunded: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
    refunded: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    cancelled: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
    voided: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Invoices</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/invoices/recurring"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Recurring
          </Link>
          <Link
            href="/dashboard/invoices/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Create invoice
          </Link>
        </div>
      </div>

      <Suspense fallback={<div className="mt-6 text-slate-500">Fetching invoices…</div>}>
        <InvoicesSection
          customers={(customers ?? []).map((c) => ({ id: c.id, name: (c.company ?? '').trim() || (c.name ?? '') || '—' }))}
          businessId={business.id}
          currency={business.currency}
          statusColors={statusColors}
        />
      </Suspense>
    </div>
  );
}
