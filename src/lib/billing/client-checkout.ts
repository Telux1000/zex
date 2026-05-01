'use client';

import type { BillingPlan, PlanBillingInterval } from '@/lib/billing/plans';
import type { CardCheckoutProvider } from '@/lib/billing/provider-choice';
import {
  billingCheckoutPerfEnabled,
  billingCheckoutPerfLog,
} from '@/lib/billing/billing-checkout-perf';
import type { CheckoutWaitlistPayload } from '@/lib/billing/checkout-waitlist-meta';

export type { CheckoutWaitlistPayload } from '@/lib/billing/checkout-waitlist-meta';

export type BillingCheckoutApiResponse =
  | { ok: true; mode: 'redirect'; redirect_url: string }
  | { ok: false; error: string; status?: number; waitlist?: CheckoutWaitlistPayload };

/** Mutable; pass same object to `requestBillingCheckout` and `completeBillingCheckoutResponse` in dev. */
export type BillingCheckoutClientTimings = {
  clickTs: number;
  requestStartAt?: number;
  responseReceivedAt?: number;
};

/**
 * Server-chosen provider; UI redirects to hosted checkout (Flutterwave / Paystack).
 */
export async function requestBillingCheckout(args: {
  plan: BillingPlan;
  billingInterval: PlanBillingInterval;
  selectedProvider?: CardCheckoutProvider;
  returnPath?: string;
  /** When set with `billingCheckoutPerfEnabled()`, records request/response timestamps on this object. */
  timings?: BillingCheckoutClientTimings;
}): Promise<BillingCheckoutApiResponse> {
  const perf = billingCheckoutPerfEnabled();
  const t = args.timings;
  if (t && perf) {
    t.requestStartAt = performance.now();
    billingCheckoutPerfLog('client', 'checkout_request_start', {
      click_to_request_start_ms: Math.round(t.requestStartAt - t.clickTs),
    });
  }

  const fetchStart = t?.requestStartAt ?? performance.now();
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: args.plan,
      billing_interval: args.billingInterval,
      selected_provider: args.selectedProvider,
      return_path: args.returnPath ?? '/dashboard/billing',
    }),
  });
  const responseReceivedAt = performance.now();
  if (t && perf) {
    t.responseReceivedAt = responseReceivedAt;
    billingCheckoutPerfLog('client', 'checkout_response_received', {
      request_roundtrip_ms: Math.round(responseReceivedAt - fetchStart),
      click_to_response_ms: Math.round(responseReceivedAt - t.clickTs),
    });
  }

  const j = (await res.json().catch(() => ({}))) as BillingCheckoutApiResponse & {
    error?: string;
    waitlist?: CheckoutWaitlistPayload;
  };
  if (!res.ok) {
    const wl =
      j.waitlist &&
      typeof j.waitlist === 'object' &&
      typeof (j.waitlist as CheckoutWaitlistPayload).trigger_reason === 'string' &&
      typeof (j.waitlist as CheckoutWaitlistPayload).source === 'string'
        ? (j.waitlist as CheckoutWaitlistPayload)
        : undefined;
    return {
      ok: false,
      error: typeof j.error === 'string' ? j.error : 'Checkout could not start.',
      status: res.status,
      ...(wl ? { waitlist: wl } : {}),
    };
  }
  if (!j || typeof j !== 'object' || (j as { ok?: boolean }).ok !== true) {
    return { ok: false, error: 'Unexpected checkout response.' };
  }
  return j as BillingCheckoutApiResponse;
}

export async function completeBillingCheckoutResponse(
  result: BillingCheckoutApiResponse,
  timings?: BillingCheckoutClientTimings
): Promise<void> {
  if (!result.ok) return;
  if (result.mode === 'redirect') {
    const redirectStartedAt = performance.now();
    if (billingCheckoutPerfEnabled() && timings?.clickTs != null && timings.responseReceivedAt != null) {
      billingCheckoutPerfLog('client', 'redirect_started', {
        response_to_redirect_ms: Math.round(redirectStartedAt - timings.responseReceivedAt),
        total_click_to_redirect_ms: Math.round(redirectStartedAt - timings.clickTs),
      });
      const rs = timings.requestStartAt ?? timings.clickTs;
      billingCheckoutPerfLog('client', 'client_summary', {
        click_to_request_start_ms: Math.round(rs - timings.clickTs),
        request_roundtrip_ms: Math.round(timings.responseReceivedAt - rs),
        response_to_redirect_ms: Math.round(redirectStartedAt - timings.responseReceivedAt),
        total_click_to_redirect_ms: Math.round(redirectStartedAt - timings.clickTs),
      });
    }
    window.location.href = result.redirect_url;
  }
}
