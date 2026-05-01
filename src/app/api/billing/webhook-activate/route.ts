import { NextResponse } from 'next/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

/**
 * Optional internal endpoint to force `subscription_status: active` (e.g. manual ops).
 * SaaS entitlements are applied from Flutterwave / Paystack webhooks and `billing-service` (see `applyVerifiedSuccessfulCharge`).
 * Header: x-billing-webhook-secret must match BILLING_WEBHOOK_SECRET.
 * Body: { owner_user_id: string } (auth.users id of the paying workspace owner).
 */
export async function POST(req: Request) {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-billing-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { owner_user_id?: string };
  try {
    body = (await req.json()) as { owner_user_id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ownerUserId = String(body.owner_user_id ?? '').trim();
  if (!ownerUserId) {
    return NextResponse.json({ error: 'Missing owner_user_id' }, { status: 400 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { error } = await admin
    .from('profiles')
    .update({ subscription_status: 'active' })
    .eq('id', ownerUserId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
