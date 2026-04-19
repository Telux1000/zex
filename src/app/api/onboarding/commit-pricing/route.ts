import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { commitPreWorkspacePricingSelection } from '@/lib/onboarding/commit-pre-workspace-pricing';

/**
 * Signup pricing step: lock plan + monthly/yearly interval + Stripe price ID, start trial, no Checkout redirect.
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

  const result = await commitPreWorkspacePricingSelection(
    supabase,
    user.id,
    body.plan ?? body.billing_plan,
    body.billing_interval ?? body.interval
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    billing_plan: result.plan,
    billing_interval: result.billing_interval,
  });
}
