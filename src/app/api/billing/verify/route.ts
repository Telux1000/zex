import { NextResponse } from 'next/server';
import { verifyAndApplyFlutterwave, verifyAndApplyPaystack } from '@/lib/billing/billing-service';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { billingLog } from '@/lib/billing/billing-logger';

export const dynamic = 'force-dynamic';

/**
 * Best-effort payment confirmation after customer redirect (webhooks remain authoritative).
 * e.g. GET /api/billing/verify?provider=flutterwave&transaction_id=123
 */
export async function GET(req: Request) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider')?.toLowerCase();
  if (provider === 'flutterwave') {
    const id = Number(searchParams.get('transaction_id'));
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'transaction_id required' }, { status: 400 });
    }
    const r = await verifyAndApplyFlutterwave(admin, id);
    if (!r.ok) {
      return NextResponse.json({ error: r.reason }, { status: 400 });
    }
    if (r.duplicate) {
      billingLog.info('verify duplicate (already processed)', { provider: 'flutterwave' });
    }
    return NextResponse.json({ ok: true, duplicate: r.duplicate });
  }
  if (provider === 'paystack') {
    const ref = searchParams.get('reference')?.trim();
    if (!ref) {
      return NextResponse.json({ error: 'reference required' }, { status: 400 });
    }
    const r = await verifyAndApplyPaystack(admin, ref);
    if (!r.ok) {
      return NextResponse.json({ error: r.reason }, { status: 400 });
    }
    if (r.duplicate) {
      billingLog.info('verify duplicate (already processed)', { provider: 'paystack' });
    }
    return NextResponse.json({ ok: true, duplicate: r.duplicate });
  }
  return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
}
