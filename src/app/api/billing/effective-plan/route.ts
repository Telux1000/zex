import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { normalizeBillingPlan } from '@/lib/billing/plans';
import {
  computeEffectiveSubscription,
  reconcileOwnerBillingEntitlements,
} from '@/lib/billing/subscription-access';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

/**
 * Returns workspace-owner billing state after server-side trial reconciliation (no client clock).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const primary = await getPrimaryBusinessForUser(user.id);
  const ownerId = primary?.ownerId ?? user.id;

  await reconcileOwnerBillingEntitlements(ownerId);

  const admin = getSupabaseServiceAdmin();
  const client = admin ?? supabase;
  const { data: row, error } = await client
    .from('profiles')
    .select('billing_plan, subscription_status, trial_started_at, trial_ends_at, trial_used')
    .eq('id', ownerId)
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json({ error: 'Could not load billing profile.' }, { status: 500 });
  }

  const { effective } = computeEffectiveSubscription({
    subscription_status: (row as { subscription_status?: string | null }).subscription_status,
    trial_started_at: (row as { trial_started_at?: string | null }).trial_started_at,
    trial_ends_at: (row as { trial_ends_at?: string | null }).trial_ends_at,
  });

  return NextResponse.json({
    billing_plan: normalizeBillingPlan((row as { billing_plan?: unknown }).billing_plan),
    subscription_effective: effective,
    trial_ends_at: (row as { trial_ends_at?: string | null }).trial_ends_at ?? null,
    trial_used: Boolean((row as { trial_used?: boolean | null }).trial_used),
    owner_user_id: ownerId,
  });
}
