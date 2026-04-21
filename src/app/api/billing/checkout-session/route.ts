import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import {
  getPricingPlan,
  normalizeBillingPlan,
  normalizePlanBillingInterval,
  type BillingPlan,
} from '@/lib/billing/plans';
import { catalogPriceIdForPlanInterval } from '@/lib/billing/catalog-price-map';
import { getPaddleBillingClient } from '@/lib/billing/paddle-client';

/**
 * Starts Paddle Checkout for workspace SaaS subscription (Merchant of Record billing).
 * Only the workspace owner can start checkout. Plan + owner are carried in transaction custom data
 * and reconciled via `/api/webhooks/paddle` subscription events.
 */
export async function POST(req: Request) {
  const paddle = getPaddleBillingClient();
  if (!paddle) {
    return NextResponse.json({ error: 'Subscription billing is not configured.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const primary = await getPrimaryBusinessForUser(user.id);
  if (primary?.ownerId && primary.ownerId !== user.id) {
    return NextResponse.json(
      { error: 'Only the workspace owner can start subscription checkout.' },
      { status: 403 }
    );
  }

  if (!user.email?.trim()) {
    return NextResponse.json({ error: 'Your account needs an email address to check out.' }, { status: 400 });
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
      {
        error:
          'The Starter plan is free and does not use checkout. Switch plans from Billing or choose a paid tier.',
      },
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
    /** Legacy column name; stores Paddle catalog price id (`pri_*`). */
    selected_stripe_price_id?: string | null;
    billing_interval?: string | null;
  } | null;

  const lockedCatalogPriceId =
    prof && normalizeBillingPlan(prof.billing_plan) === plan && prof.selected_stripe_price_id?.trim()
      ? prof.selected_stripe_price_id.trim()
      : '';

  const requestedInterval = normalizePlanBillingInterval(body.billing_interval);
  const interval = requestedInterval ?? normalizePlanBillingInterval(prof?.billing_interval) ?? 'monthly';
  const priceId =
    lockedCatalogPriceId ||
    catalogPriceIdForPlanInterval(plan, interval) ||
    pricing.catalogPriceId?.trim() ||
    '';

  if (!priceId) {
    return NextResponse.json(
      {
        error:
          'Catalog price is not configured for this plan. Set NEXT_PUBLIC_PADDLE_PRICE_*_MONTHLY / *_YEARLY env vars.',
      },
      { status: 400 }
    );
  }

  const billingInterval = normalizePlanBillingInterval(prof?.billing_interval);

  let customerId: string;
  try {
    customerId = await getOrCreatePaddleCustomer(paddle, user.email.trim(), user.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not create billing customer';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let checkoutUrl: string | null = null;
  try {
    const transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customerId,
      customData: {
        saas_owner_user_id: user.id,
        saas_billing_plan: plan,
        saas_billing_interval: billingInterval ?? '',
      },
    });
    checkoutUrl = transaction.checkout?.url ?? null;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Checkout creation failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!checkoutUrl) {
    return NextResponse.json(
      { error: 'Paddle did not return a checkout URL. Check transaction/custom_data and Paddle dashboard settings.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: checkoutUrl });
}

async function getOrCreatePaddleCustomer(
  paddle: NonNullable<ReturnType<typeof getPaddleBillingClient>>,
  email: string,
  userId: string
): Promise<string> {
  const collection = paddle.customers.list({ email: [email] });
  const page = await collection.next();
  if (page.length > 0) {
    return page[0].id;
  }
  const created = await paddle.customers.create({
    email,
    customData: { saas_owner_user_id: userId },
  });
  return created.id;
}
