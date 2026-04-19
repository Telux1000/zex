import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { evaluateStripeConnectAccount } from '@/lib/stripe-connect';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: business } = await supabase
      .from('businesses')
      .select('id, stripe_account_id')
      .eq('owner_id', user.id)
      .limit(1)
      .single();

    if (!business || !business.stripe_account_id) {
      return NextResponse.json({
        stripe_onboarding_status: 'not_connected',
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
      });
    }

    const account = await getStripe().accounts.retrieve(business.stripe_account_id);
    const evaluation = evaluateStripeConnectAccount(account);
    const stripe_onboarding_status = evaluation.status;

    await supabase
      .from('businesses')
      .update({
        stripe_charges_enabled: evaluation.charges_enabled,
        stripe_payouts_enabled: evaluation.payouts_enabled,
        stripe_details_submitted: evaluation.details_submitted,
        stripe_onboarding_status,
      })
      .eq('id', business.id);

    return NextResponse.json({
      stripe_onboarding_status,
      stripe_charges_enabled: evaluation.charges_enabled,
      stripe_payouts_enabled: evaluation.payouts_enabled,
      stripe_details_submitted: evaluation.details_submitted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to sync Stripe status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
