import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { stripe } from '@/lib/stripe';
import { evaluateStripeConnectAccount } from '@/lib/stripe-connect';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export async function POST(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const body = (await req.json()) as { business_id?: string };
  const businessId = String(body.business_id ?? '').trim();
  if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: business, error } = await admin
    .from('businesses')
    .select('id, stripe_account_id')
    .eq('id', businessId)
    .maybeSingle();
  if (error || !business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  if (!business.stripe_account_id) {
    return NextResponse.json({ ok: true, stripe_onboarding_status: 'not_connected' });
  }

  const account = await stripe.accounts.retrieve(String(business.stripe_account_id));
  const evaluation = evaluateStripeConnectAccount(account);
  await admin
    .from('businesses')
    .update({
      stripe_charges_enabled: evaluation.charges_enabled,
      stripe_payouts_enabled: evaluation.payouts_enabled,
      stripe_details_submitted: evaluation.details_submitted,
      stripe_onboarding_status: evaluation.status,
    })
    .eq('id', business.id);

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'admin_billing_synced',
    targetType: 'business',
    targetId: business.id,
  });

  return NextResponse.json({
    ok: true,
    stripe_onboarding_status: evaluation.status,
    stripe_charges_enabled: evaluation.charges_enabled,
    stripe_payouts_enabled: evaluation.payouts_enabled,
  });
}
