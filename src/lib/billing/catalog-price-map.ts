import { planIsFree, type BillingPlan, type PlanBillingInterval } from '@/lib/billing/plans';

/**
 * Paddle catalog price IDs (`pri_*`) for self-serve SaaS plans.
 *
 * Assumptions:
 * - Each env value is a Billing API price ID created in Paddle for a recurring subscription.
 * - Monthly: NEXT_PUBLIC_PADDLE_PRICE_{PLAN_UPPER}_MONTHLY (preferred)
 * - Yearly: NEXT_PUBLIC_PADDLE_PRICE_{PLAN_UPPER}_YEARLY (optional; falls back to monthly if unset).
 * - Legacy monthly fallback supported: NEXT_PUBLIC_PADDLE_PRICE_{PLAN_UPPER}
 *
 * TODO: Create matching products/prices in Paddle sandbox/production and set these env vars.
 */
const MONTHLY_ENV: Record<BillingPlan, string | undefined> = {
  starter: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER,
  growth: process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH,
  professional:
    process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL,
  enterprise: process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE,
};

const YEARLY_ENV: Record<BillingPlan, string | undefined> = {
  starter: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEARLY,
  growth: process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_YEARLY,
  professional: process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_YEARLY,
  enterprise: process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_YEARLY,
};
let envValidationLogged = false;

function trimId(id: string | undefined | null): string | null {
  const t = id?.trim();
  return t ? t : null;
}

/** Locked catalog price ID for Checkout; null if not configured or plan is free. */
export function catalogPriceIdForPlanInterval(
  plan: BillingPlan,
  interval: PlanBillingInterval
): string | null {
  if (planIsFree(plan)) return null;
  const monthly = trimId(MONTHLY_ENV[plan]);
  const yearly = trimId(YEARLY_ENV[plan]) ?? monthly;
  if (interval === 'yearly') return yearly;
  return monthly;
}

export function validatePublicPaddlePriceEnv(): void {
  if (envValidationLogged || typeof window === 'undefined') return;
  envValidationLogged = true;
  const plans: BillingPlan[] = ['growth', 'professional', 'enterprise'];
  for (const plan of plans) {
    const monthly = catalogPriceIdForPlanInterval(plan, 'monthly');
    const yearly = catalogPriceIdForPlanInterval(plan, 'yearly');
    if (!monthly) {
      console.error(
        `[Paddle] Missing monthly price ID for ${plan}. Set NEXT_PUBLIC_PADDLE_PRICE_${plan.toUpperCase()}_MONTHLY.`
      );
    }
    if (!yearly) {
      console.error(
        `[Paddle] Missing yearly price ID for ${plan}. Set NEXT_PUBLIC_PADDLE_PRICE_${plan.toUpperCase()}_YEARLY.`
      );
    }
  }
}

/** Reverse lookup for webhook payloads (subscription line items). */
export function billingPlanFromCatalogPriceId(priceId: string | null | undefined): BillingPlan | null {
  const id = trimId(priceId);
  if (!id) return null;
  const plans: BillingPlan[] = ['starter', 'growth', 'professional', 'enterprise'];
  for (const plan of plans) {
    if (planIsFree(plan)) continue;
    for (const interval of ['monthly', 'yearly'] as const) {
      if (catalogPriceIdForPlanInterval(plan, interval) === id) return plan;
    }
  }
  return null;
}
