import Link from 'next/link';
import {
  getPrimaryBusinessForUser,
  getServerSupabaseUser,
} from '@/lib/supabase/server-auth';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { DashboardCard } from '@/components/dashboard/ui/dashboard-card';
import QuotesManagementTable from '@/components/quotes/QuotesManagementTable';

export default async function QuotesPage() {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) {
    return (
      <div className="mx-auto max-w-2xl">
        <DashboardCard>
          <p className="text-slate-600 dark:text-slate-400">Create a business first.</p>
          <Link
            href="/onboarding"
            className="mt-3 inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400"
          >
            Onboarding →
          </Link>
        </DashboardCard>
      </div>
    );
  }

  const { data: quotes } = await supabase
    .from('quotes')
    .select(
      'id, quote_number, customer_snapshot, issue_date, expiry_date, status, total, currency, accepted_via, rejected_via, accepted_note, rejection_reason, accepted_at, rejected_at, confirmation_channel, converted_invoice_id, converted_invoice_number'
    )
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Quotes</h1>
        <Link
          href="/dashboard/quotes/new"
          className="app-btn-primary inline-flex items-center justify-center"
        >
          Create Quote
        </Link>
      </div>
      <DashboardCard className="overflow-hidden p-0">
        <QuotesManagementTable quotes={(quotes ?? []) as any} businessCurrency={business.currency} />
      </DashboardCard>
    </div>
  );
}
