import { notFound } from 'next/navigation';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { CustomerEditRouteClient } from '@/components/customers/CustomerEditRouteClient';

export default async function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const { id } = await params;

  const { data: customer } = await supabase.from('customers').select('*').eq('id', id).single();
  if (!customer) notFound();

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('id', customer.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <CustomerEditRouteClient
        customer={customer}
        businessId={String(business.id)}
        companyBaseCurrency={business.currency != null ? String(business.currency) : null}
      />
    </div>
  );
}
