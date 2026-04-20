import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isStripeConnectRestApiEnabled } from '@/lib/integrations/stripe-connect/connect-rest-enabled';

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
        ok: true,
        stripe_onboarding_status: 'not_connected',
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
      });
    }

    if (!isStripeConnectRestApiEnabled()) {
      const { data: row } = await supabase
        .from('businesses')
        .select(
          'stripe_onboarding_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted'
        )
        .eq('id', business.id)
        .single();
      return NextResponse.json({
        ok: true,
        stripe_connect: 'disabled',
        message:
          'Stripe Connect API sync is disabled. Set STRIPE_CONNECT_ENABLED=true to enable live status refresh.',
        stripe_onboarding_status: String(row?.stripe_onboarding_status ?? 'not_connected'),
        stripe_charges_enabled: Boolean(row?.stripe_charges_enabled),
        stripe_payouts_enabled: Boolean(row?.stripe_payouts_enabled),
        stripe_details_submitted: Boolean(row?.stripe_details_submitted),
      });
    }

    const { getStripe } = await import('@/lib/stripe');
    const { evaluateStripeConnectAccount } = await import('@/lib/stripe-connect');

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
