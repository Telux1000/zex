import { timingSafeEqual } from 'node:crypto';
import type { BillingCheckoutServerPerf } from '@/lib/billing/billing-checkout-perf';
import { BillingProviderError, type CheckoutContext, type CreateCheckoutResult } from '@/lib/billing/billing-types';
import { saasHostedCheckoutReference } from '@/lib/billing/checkout-reference';
import { flutterwavePaymentPlanId } from '@/lib/billing/plan-provider-refs';
import { planTotalCentsForInterval } from '@/lib/billing/plan-charge-cents';
import { planIsFree } from '@/lib/billing/plans';
import { getAppBaseUrl } from '@/lib/billing/app-base-url';

const API = 'https://api.flutterwave.com/v3';

function secret(): string {
  const k = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
  if (!k) throw new BillingProviderError('FLUTTERWAVE_SECRET_KEY is not set', 'flutterwave');
  return k;
}

function formatAmount(currency: string, totalCents: number): string {
  const c = currency.toUpperCase();
  if (c === 'JPY' || c === 'KRW') return String(Math.round(totalCents / 100));
  return (totalCents / 100).toFixed(2);
}

export type FlutterwaveTxVerify = {
  id: number;
  status: string;
  amount: number;
  currency: string;
  tx_ref: string;
  customer?: { email?: string; id?: number };
  /** Present on successful verify; maps to payment `meta` from initialize. */
  meta?: Record<string, unknown> | null;
  created_at?: string;
};

export async function createFlutterwaveCheckout(
  ctx: CheckoutContext,
  internalSubscriptionId: string,
  perf?: BillingCheckoutServerPerf
): Promise<CreateCheckoutResult> {
  if (planIsFree(ctx.plan)) {
    throw new BillingProviderError('Cannot checkout a free plan', 'flutterwave');
  }
  const totalCents = planTotalCentsForInterval(ctx.plan, ctx.interval);
  if (totalCents <= 0) {
    throw new BillingProviderError('Invalid plan amount', 'flutterwave');
  }
  const currency = 'USD';
  const paymentPlan = flutterwavePaymentPlanId(ctx.plan, ctx.interval);
  const base = getAppBaseUrl();
  const txRef = saasHostedCheckoutReference(internalSubscriptionId);

  const body: Record<string, unknown> = {
    tx_ref: txRef,
    amount: formatAmount(currency, totalCents),
    currency,
    redirect_url: `${base}${ctx.returnPath.startsWith('/') ? ctx.returnPath : `/${ctx.returnPath}`}`,
    payment_options: 'card,ussd,account,transfer',
    customer: {
      email: ctx.userEmail ?? `user-${ctx.userId}@placeholder.zenzex.local`,
    },
    customizations: {
      title: 'Zenzex',
    },
    meta: {
      subscription_id: internalSubscriptionId,
      user_id: ctx.userId,
      business_id: ctx.businessId,
      plan_id: ctx.plan,
      billing_interval: ctx.interval,
    },
  };
  if (paymentPlan) {
    const n = Number(paymentPlan);
    body.payment_plan = Number.isFinite(n) ? n : paymentPlan;
  }

  perf?.mark('flutterwave_api_request_start', { provider: 'flutterwave' });
  const fwHttpStart = Date.now();
  const res = await fetch(`${API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: { link?: string } };
  perf?.mark('flutterwave_api_request_done', {
    flutterwave_api_duration_ms: Date.now() - fwHttpStart,
    provider: 'flutterwave',
  });
  if (!res.ok || String(json?.status) !== 'success' || !json.data?.link) {
    const msg = typeof json?.message === 'string' ? json.message : 'Flutterwave init failed';
    throw new BillingProviderError(msg, 'flutterwave');
  }
  return {
    kind: 'redirect',
    provider: 'flutterwave',
    redirectUrl: json.data.link,
    internalSubscriptionId,
  };
}

export async function verifyFlutterwaveTransactionById(id: number): Promise<FlutterwaveTxVerify> {
  const res = await fetch(`${API}/transactions/${id}/verify`, {
    headers: { Authorization: `Bearer ${secret()}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    data?: FlutterwaveTxVerify;
    message?: string;
  };
  if (!res.ok || String(json?.status) !== 'success' || !json.data) {
    const msg = typeof json?.message === 'string' ? json.message : 'verify failed';
    throw new BillingProviderError(msg, 'flutterwave');
  }
  return json.data;
}

export function verifyFlutterwaveWebhookHash(headerHash: string | null): boolean {
  const expected = process.env.FLUTTERWAVE_SECRET_HASH?.trim();
  if (!expected || !headerHash) return false;
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(headerHash, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
