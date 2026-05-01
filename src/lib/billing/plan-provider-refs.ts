import type { BillingPlan, PlanBillingInterval } from '@/lib/billing/plans';

/**
 * Server-only mapping: internal plan + interval → provider plan / link reference.
 * Never import this from client components — keep refs out of the bundle.
 */

function envTrim(key: string): string | null {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : null;
}

/** Flutterwave v3 `payment_plan` id (optional — omit for one-time charge using amount). */
export function flutterwavePaymentPlanId(
  plan: BillingPlan,
  interval: PlanBillingInterval
): string | null {
  if (plan === 'starter') return null;
  const p = plan.toUpperCase();
  const i = interval === 'yearly' ? 'YEARLY' : 'MONTHLY';
  return envTrim(`FLUTTERWAVE_PAYMENT_PLAN_${p}_${i}`) ?? envTrim(`FLUTTERWAVE_PAYMENT_PLAN_${p}`);
}

/** Paystack plan code for subscriptions (e.g. PLN_xxx). */
export function paystackPlanCode(plan: BillingPlan, interval: PlanBillingInterval): string | null {
  if (plan === 'starter') return null;
  const p = plan.toUpperCase();
  const i = interval === 'yearly' ? 'YEARLY' : 'MONTHLY';
  return envTrim(`PAYSTACK_PLAN_${p}_${i}`) ?? envTrim(`PAYSTACK_PLAN_${p}`);
}

/** Reserved for a future hosted Stripe checkout / price id. */
export function stripePriceId(plan: BillingPlan, interval: PlanBillingInterval): string | null {
  if (plan === 'starter') return null;
  const p = plan.toUpperCase();
  const i = interval === 'yearly' ? 'YEARLY' : 'MONTHLY';
  return (
    envTrim(`STRIPE_BILLING_PRICE_${p}_${i}`) ?? envTrim(`STRIPE_BILLING_PRICE_${p}`) ?? null
  );
}

/** Opaque “locked catalog” string stored on `profiles.selected_catalog_price_id` for internal billing. */
export function internalCatalogKey(
  provider: 'flutterwave' | 'paystack' | 'stripe',
  plan: BillingPlan,
  interval: PlanBillingInterval
): string {
  return `zenzex:billing:${provider}:${plan}:${interval}`;
}

/** Checkout display currency (Flutterwave / Paystack); amount math uses USD cents in parallel. */
export function billingCheckoutCurrency(): string {
  return (process.env.BILLING_CHECKOUT_CURRENCY?.trim() || 'USD').toUpperCase();
}

export function paystackCheckoutCurrency(): string {
  return (process.env.PAYSTACK_CURRENCY?.trim() || 'ZAR').toUpperCase();
}

export function paystackAmountOverrideSubunits(
  plan: BillingPlan,
  interval: PlanBillingInterval
): number | null {
  if (plan === 'starter') return null;
  const p = plan.toUpperCase();
  const i = interval === 'yearly' ? 'YEARLY' : 'MONTHLY';
  const raw =
    envTrim(`PAYSTACK_PRICE_${p}_${i}`) ??
    envTrim(`PAYSTACK_PRICE_${p}`) ??
    envTrim(`PAYSTACK_AMOUNT_${p}_${i}`) ??
    envTrim(`PAYSTACK_AMOUNT_${p}`);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}
