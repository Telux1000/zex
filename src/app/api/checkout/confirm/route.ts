import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { fetchOnboardingEntryState } from '@/lib/onboarding/entry-state';
import { verifyAndApplyFlutterwave, verifyAndApplyPaystack } from '@/lib/billing/billing-service';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

/**
 * Onboarding: confirm paid checkout after return from Flutterwave or Paystack (or client retry).
 * Prefer GET `/api/billing/verify` on redirect; this POST exists for explicit client confirmation.
 */
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

  const primaryBusiness = await getPrimaryBusinessForUser(user.id);
  const beforeState = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
  if (beforeState.selection_status !== 'PAID_PENDING_CHECKOUT') {
    return NextResponse.json(beforeState);
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }

  const provider = String(body.provider ?? '').trim().toLowerCase();
  if (provider === 'flutterwave') {
    const id = Number(body.transaction_id ?? body.checkout_reference);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'transaction_id required' }, { status: 400 });
    }
    const v = await verifyAndApplyFlutterwave(admin, id);
    if (!v.ok) {
      const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
      return NextResponse.json(
        { ...state, error: 'Payment is not confirmed yet. Finish checkout to continue.' },
        { status: 409 }
      );
    }
    const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
    return NextResponse.json(state);
  }
  if (provider === 'paystack') {
    const ref = String(body.reference ?? body.checkout_reference ?? '').trim();
    if (!ref) {
      return NextResponse.json({ error: 'reference required' }, { status: 400 });
    }
    const v = await verifyAndApplyPaystack(admin, ref);
    if (!v.ok) {
      const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
      return NextResponse.json(
        { ...state, error: 'Payment is not confirmed yet. Finish checkout to continue.' },
        { status: 409 }
      );
    }
    const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
    return NextResponse.json(state);
  }

  return NextResponse.json({ error: 'Unsupported checkout provider.' }, { status: 400 });
}
