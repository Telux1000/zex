import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { getPricingPlan, normalizeBillingPlan, type BillingPlan } from '@/lib/billing/plans';
import { stripe } from '@/lib/stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Creates a Stripe Checkout Session (subscription) for workspace SaaS billing.
 * Only the workspace owner can start checkout. Plan tier is stored in session metadata
 * and applied when checkout.session.completed fires on /api/stripe/webhook.
 */
export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const primary = await getPrimaryBusinessForUser(user.id);
  if (!primary?.ownerId || primary.ownerId !== user.id) {
    return NextResponse.json(
      { error: 'Only the workspace owner can start subscription checkout.' },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const plan = normalizeBillingPlan(body.plan ?? body.billing_plan) as BillingPlan;
  const pricing = getPricingPlan(plan);
  if (pricing.isFree) {
    return NextResponse.json(
      { error: 'The Starter plan is free and does not use Stripe Checkout. Switch plans from Billing or choose a paid tier.' },
      { status: 400 }
    );
  }

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('billing_plan, selected_stripe_price_id, billing_interval')
    .eq('id', user.id)
    .maybeSingle();
  const prof = ownerProfile as {
    billing_plan?: unknown;
    selected_stripe_price_id?: string | null;
    billing_interval?: string | null;
  } | null;
  const lockedPrice =
    prof && normalizeBillingPlan(prof.billing_plan) === plan && prof.selected_stripe_price_id?.trim()
      ? prof.selected_stripe_price_id.trim()
      : '';

  const priceId = lockedPrice || (pricing.stripePriceId?.trim() ?? '');
  if (!priceId) {
    return NextResponse.json(
      { error: 'Stripe price is not configured for this plan. Set NEXT_PUBLIC_STRIPE_PRICE_* env vars.' },
      { status: 400 }
    );
  }

  const successUrl = `${APP_URL.replace(/\/$/, '')}/dashboard/billing?checkout=success`;
  const cancelUrl = `${APP_URL.replace(/\/$/, '')}/dashboard/billing?checkout=cancelled`;

  let session: { url: string | null };
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        saas_owner_user_id: user.id,
        saas_billing_plan: plan,
        saas_billing_interval: prof?.billing_interval?.trim() ?? '',
      },
      subscription_data: {
        metadata: {
          saas_owner_user_id: user.id,
          saas_billing_plan: plan,
          saas_billing_interval: prof?.billing_interval?.trim() ?? '',
        },
      },
      allow_promotion_codes: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Stripe checkout failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
