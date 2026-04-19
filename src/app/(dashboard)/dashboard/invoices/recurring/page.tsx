import Link from 'next/link';
import { hasPermission } from '@/lib/rbac/permissions';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { getPrimaryBusinessForUser, getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { RecurringInvoicesManageClient } from '@/components/invoices/RecurringInvoicesManageClient';

export default async function RecurringInvoicesPage() {
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

  const role = await getEffectiveBusinessRole(supabase, business.id, user.id);
  if (!role || !hasPermission(role, 'view_data')) {
    return null;
  }

  const canMutate = hasPermission(role, 'create_invoice') || hasPermission(role, 'manage_invoices');

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Recurring invoices</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Automated schedules create invoices daily (UTC). Draft is the default; optional auto-send must be chosen explicitly.
          </p>
        </div>
        <Link
          href="/dashboard/invoices"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          All invoices
        </Link>
      </div>

      <RecurringInvoicesManageClient businessId={business.id} canMutate={canMutate} />
    </div>
  );
}
