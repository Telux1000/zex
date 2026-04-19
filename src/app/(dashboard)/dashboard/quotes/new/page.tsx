import { QuoteForm } from '@/components/quotes/QuoteForm';
import { getPrimaryBusinessForUser, getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { primaryBusinessToQuoteIssuer } from '@/lib/quotes/issuer';
import { redirectToOnboardingIfCoreIncomplete } from '@/lib/onboarding/core-setup-redirect';

export default async function NewQuotePage() {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-slate-600 dark:text-slate-300">Create a business first.</p>
        <a href="/onboarding" className="text-indigo-600 dark:text-indigo-400">
          Onboarding
        </a>
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

  const { data: customerRows } = await supabase
    .from('customers')
    .select('id, name, company, email, address_line1, address_line2, city, state, postal_code, country')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const customers = (customerRows ?? []).map((c) => {
    const label = String(c.company || c.name || 'Customer').trim();
    return {
      id: String(c.id),
      label,
      company: c.company ?? null,
      email: c.email ?? null,
      address_line1: c.address_line1 ?? null,
      address_line2: c.address_line2 ?? null,
      city: c.city ?? null,
      state: c.state ?? null,
      postal_code: c.postal_code ?? null,
      country: c.country ?? null,
    };
  });

  return (
    <QuoteForm
      businessId={business.id}
      customers={customers}
      issuer={primaryBusinessToQuoteIssuer(business)}
      mode="create"
    />
  );
}
