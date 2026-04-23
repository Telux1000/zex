import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { fetchOnboardingEntryState } from '@/lib/onboarding/entry-state';
import { getPaddleBillingClient } from '@/lib/billing/paddle-client';

async function verifyPaddleSuccess(input: {
  transactionId: string | null;
  subscriptionId: string | null;
  checkoutReference: string | null;
}): Promise<{ ok: boolean; subscriptionStatus: 'active' | 'trialing' }> {
  const paddle = getPaddleBillingClient();
  if (!paddle) return { ok: false, subscriptionStatus: 'active' };

  const possibleSubscriptionIds = [input.subscriptionId, input.checkoutReference]
    .map((v) => (v ? v.trim() : ''))
    .filter(Boolean);

  try {
    if (input.transactionId) {
      const tx = await (paddle as any).transactions?.get?.(input.transactionId);
      const txStatus = String(tx?.status ?? '').toLowerCase();
      if (txStatus === 'completed' || txStatus === 'paid' || txStatus === 'billed') {
        const subFromTx = String(tx?.subscriptionId ?? tx?.subscription_id ?? '').trim();
        if (subFromTx) possibleSubscriptionIds.unshift(subFromTx);
      }
    }

    for (const id of possibleSubscriptionIds) {
      const sub = await (paddle as any).subscriptions?.get?.(id);
      const status = String(sub?.status ?? '').toLowerCase();
      if (status === 'active') return { ok: true, subscriptionStatus: 'active' };
      if (status === 'trialing') return { ok: true, subscriptionStatus: 'trialing' };
    }
  } catch {
    return { ok: false, subscriptionStatus: 'active' };
  }

  return { ok: false, subscriptionStatus: 'active' };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const provider = String(body.provider ?? '').trim().toLowerCase();
  if (provider !== 'paddle') {
    return NextResponse.json({ error: 'Unsupported checkout provider.' }, { status: 400 });
  }

  const primaryBusiness = await getPrimaryBusinessForUser(user.id);
  const beforeState = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
  if (beforeState.selection_status !== 'PAID_PENDING_CHECKOUT') {
    return NextResponse.json(beforeState);
  }

  const checkoutReference = String(body.checkout_reference ?? '').trim() || null;
  const transactionId = String(body.transaction_id ?? '').trim() || null;
  const subscriptionId = String(body.subscription_id ?? '').trim() || null;

  const verified = await verifyPaddleSuccess({
    transactionId,
    subscriptionId,
    checkoutReference,
  });

  if (!verified.ok) {
    const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
    return NextResponse.json(
      {
        ...state,
        error: 'Payment is not confirmed yet. Your plan is selected. Finish checkout to continue.',
      },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      plan_selection_status: 'PAID_ACTIVE',
      pending_checkout_provider: null,
      pending_checkout_plan: null,
      onboarding_pricing_completed_at: new Date().toISOString(),
      subscription_status: verified.subscriptionStatus,
    })
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
  return NextResponse.json(state);
}
