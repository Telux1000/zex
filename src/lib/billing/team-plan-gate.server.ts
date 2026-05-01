import { NextResponse } from 'next/server';
import { featureUpgradeMessage, hasPlanFeature, normalizeBillingPlan } from '@/lib/billing/plans';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

/**
 * Team invites and related actions require the business owner's plan to include `teams` (Enterprise).
 * Uses the service client so this check is not blocked by RLS.
 */
export async function requireTeamInvitesForBusiness(businessId: string): Promise<NextResponse | null> {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }
  const { data: biz, error: bizErr } = await admin
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .maybeSingle();
  if (bizErr || !biz) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { data: prof } = await admin
    .from('profiles')
    .select('billing_plan')
    .eq('id', String(biz.owner_id))
    .maybeSingle();
  if (!hasPlanFeature(prof?.billing_plan, 'teams')) {
    return NextResponse.json(
      { error: featureUpgradeMessage('teams'), code: 'plan_feature_teams' },
      { status: 403 }
    );
  }
  return null;
}

export function ownerHasTeamInvitesEntitlement(
  ownerBillingPlan: unknown
): boolean {
  return hasPlanFeature(normalizeBillingPlan(ownerBillingPlan), 'teams');
}
