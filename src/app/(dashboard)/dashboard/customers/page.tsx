import Link from 'next/link';
import CustomersTable from '@/components/customers/CustomersTable';
import {
  getPrimaryBusinessForUser,
  getServerSupabaseUser,
} from '@/lib/supabase/server-auth';
import { redirectToOnboardingIfCoreIncomplete } from '@/lib/onboarding/core-setup-redirect';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { add?: string; return_to?: string };
}) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-400">Create a business first.</p>
        <Link href="/onboarding" className="mt-2 inline-block text-indigo-600 hover:underline dark:text-indigo-400">
          Onboarding
        </Link>
      </div>
    );
  }

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('full_name, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle();

  const { count: customerCount } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id);

  redirectToOnboardingIfCoreIncomplete({
    profile: profileRow as { full_name?: string | null; onboarding_completed_at?: string | null } | null,
    business,
    customerCount: customerCount ?? 0,
  });

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  const add = searchParams?.add;
  const openAddOnMount = add === '1' || add === 'true';
  const returnToAfterCreate = searchParams?.return_to?.trim() || null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Customers</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Manage your customers and their contact information.
      </p>

      <div className="mt-6">
        <CustomersTable
          businessId={business.id}
          companyBaseCurrency={business.currency}
          initialCustomers={customers ?? []}
          openAddOnMount={openAddOnMount}
          returnToAfterCreate={returnToAfterCreate}
        />
      </div>
    </div>
  );
}
