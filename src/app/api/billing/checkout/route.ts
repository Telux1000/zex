import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { getAppBaseUrl } from '@/lib/billing/app-base-url';
import type { CheckoutContext } from '@/lib/billing/billing-types';
import { createSaaSCheckout, extractBillingPlanFromRequest } from '@/lib/billing/billing-service';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { billingLog } from '@/lib/billing/billing-logger';
import {
  BillingCheckoutServerPerf,
  billingCheckoutPerfEnabled,
} from '@/lib/billing/billing-checkout-perf';
import { parseCardCheckoutProvider } from '@/lib/billing/provider-choice';
import {
  classifyCheckoutFailureForWaitlist,
  classifyUnknownCheckoutErrorForWaitlist,
} from '@/lib/billing/checkout-waitlist-meta';

export const dynamic = 'force-dynamic';

/**
 * Internal SaaS checkout: Flutterwave → Paystack (redirect only). Never expose secret keys.
 */
export async function POST(req: Request) {
  const perf = billingCheckoutPerfEnabled() ? new BillingCheckoutServerPerf() : undefined;
  let checkoutSucceeded = false;
  let resultProvider: string | undefined;

  try {
    perf?.mark('request_received');
    const admin = getSupabaseServiceAdmin();
    if (!admin) {
      perf?.finish({ ok: false, reason: 'no_admin' });
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
    }
    perf?.mark('admin_client_ready');

    perf?.mark('auth_session_lookup_start');
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    perf?.mark('auth_session_lookup_done', { authenticated: user ? 1 : 0 });
    if (!user) {
      perf?.finish({ ok: false, reason: 'unauthorized' });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    perf?.mark('body_json_parse_start');
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      perf?.finish({ ok: false, reason: 'invalid_json' });
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    perf?.mark('body_json_parse_done');

    const parsed = extractBillingPlanFromRequest(body);
    if (!parsed) {
      perf?.finish({ ok: false, reason: 'invalid_plan' });
      return NextResponse.json(
        { error: 'A paid plan and billing interval are required. Starter does not use checkout here.' },
        { status: 400 }
      );
    }
    perf?.mark('plan_mapping_ok', { plan: parsed.plan, interval: parsed.interval });

    const returnPath =
      typeof body.return_path === 'string' && body.return_path.startsWith('/')
        ? body.return_path
        : '/dashboard/billing';
    const selectedProvider = parseCardCheckoutProvider(body.selected_provider);
    if (body.selected_provider !== undefined && !selectedProvider) {
      perf?.finish({ ok: false, reason: 'invalid_provider' });
      return NextResponse.json({ error: 'Invalid checkout provider selection.' }, { status: 400 });
    }

    perf?.mark('workspace_business_lookup_start');
    const primaryBusiness = await getPrimaryBusinessForUser(user.id);
    perf?.mark('workspace_business_lookup_done', { has_business: primaryBusiness ? 1 : 0 });
    if (
      primaryBusiness &&
      (!primaryBusiness.ownerId || primaryBusiness.ownerId !== user.id)
    ) {
      perf?.finish({ ok: false, reason: 'not_owner' });
      return NextResponse.json(
        { error: 'Only the workspace owner can start subscription checkout.' },
        { status: 403 }
      );
    }

    const ctx: CheckoutContext = {
      userId: user.id,
      businessId: primaryBusiness?.id ?? null,
      userEmail: user.email ?? null,
      plan: parsed.plan,
      interval: parsed.interval,
      appBaseUrl: getAppBaseUrl(),
      returnPath,
    };

    perf?.mark('createSaaSCheckout_invoke');
    const r = await createSaaSCheckout(
      admin,
      ctx,
      { plan: parsed.plan, interval: parsed.interval },
      perf,
      selectedProvider
    );
    perf?.mark('createSaaSCheckout_returned');
    checkoutSucceeded = true;
    resultProvider = r.provider;

    billingLog.info('checkout created', { userId: user.id });
    perf?.mark('response_json_serialize_ready');
    const res = NextResponse.json({ ok: true, mode: 'redirect', redirect_url: r.redirectUrl });
    perf?.finish({
      ok: true,
      provider: r.provider,
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Checkout failed';
    const lower = message.toLowerCase();
    const isPaystackError = lower.includes('paystack');
    if (isPaystackError) {
      billingLog.warn('paystack_checkout_failure', { reason: message.slice(0, 180) });
    }
    perf?.finish({
      ok: checkoutSucceeded,
      provider: resultProvider ?? 'none',
      error: message.slice(0, 120),
    });

    const classified = classifyCheckoutFailureForWaitlist(e);
    if (classified) {
      return NextResponse.json(
        { ok: false, error: classified.userMessage, waitlist: classified.waitlist },
        { status: classified.httpStatus }
      );
    }

    if (lower.includes('paystack') || lower.includes('flutterwave') || lower.includes('currency')) {
      const waitlist = classifyUnknownCheckoutErrorForWaitlist(message);
      return NextResponse.json(
        {
          ok: false,
          error: "Payment isn't available for your region yet.",
          waitlist,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: isPaystackError
          ? 'Paystack checkout could not be started. Please try again or choose another payment method.'
          : 'Secure checkout is temporarily unavailable. Please try again.',
      },
      { status: 500 }
    );
  }
}
