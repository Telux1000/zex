import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { normalizeBillingPlan, type BillingPlan } from '@/lib/billing/plans';

/**
 * Switch self-serve plan tier for existing workspaces.
 * Before the first workspace exists, use POST /api/onboarding/commit-pricing (plan + billing_interval + trial start, no Checkout).
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const plan = normalizeBillingPlan(body.plan ?? body.billing_plan) as BillingPlan;

  const primary = await getPrimaryBusinessForUser(user.id);

  if (!primary) {
    return NextResponse.json(
      {
        error:
          'Before your first workspace, use POST /api/onboarding/commit-pricing with plan and billing_interval to start your trial.',
      },
      { status: 400 }
    );
  }

  if (!primary.ownerId || primary.ownerId !== user.id) {
    return NextResponse.json(
      { error: 'Only the workspace owner can change the subscription plan.' },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('profiles').update({ billing_plan: plan }).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, billing_plan: plan });
}
