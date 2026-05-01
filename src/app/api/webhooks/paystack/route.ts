import { NextResponse } from 'next/server';
import { handlePaystackEventWebhook } from '@/lib/billing/billing-service';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { billingLog } from '@/lib/billing/billing-logger';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }
  const rawBody = await req.text();
  const headers = req.headers;
  try {
    await handlePaystackEventWebhook(admin, { rawBody, headers });
    return NextResponse.json({ received: true });
  } catch (e) {
    billingLog.warn('webhook handler error', { provider: 'paystack', outcome: 'failure' });
    const msg = e instanceof Error ? e.message : 'webhook error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
