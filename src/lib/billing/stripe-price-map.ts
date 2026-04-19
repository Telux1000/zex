import { planIsFree, type BillingPlan, type PlanBillingInterval } from '@/lib/billing/plans';

/**
 * Central Stripe Price ID lookup for plan + billing interval.
 * Monthly IDs: NEXT_PUBLIC_STRIPE_PRICE_{PLAN}
 * Yearly IDs: NEXT_PUBLIC_STRIPE_PRICE_{PLAN}_YEARLY (optional — falls back to monthly if unset).
 */
const MONTHLY_ENV: Record<BillingPlan, string | undefined> = {
  starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
  growth: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH,
  professional: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL,
  enterprise: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE,
};

const YEARLY_ENV: Record<BillingPlan, string | undefined> = {
  starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_YEARLY,
  growth: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH_YEARLY,
  professional: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL_YEARLY,
  enterprise: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_YEARLY,
};

function trimId(id: string | undefined | null): string | null {
  const t = id?.trim();
  return t ? t : null;
}

/** Stripe Price ID for Checkout / persistence; null if env not configured or plan is free (no Stripe tier). */
export function stripePriceIdForPlanInterval(
  plan: BillingPlan,
  interval: PlanBillingInterval
): string | null {
  if (planIsFree(plan)) return null;
  const monthly = trimId(MONTHLY_ENV[plan]);
  const yearly = trimId(YEARLY_ENV[plan]) ?? monthly;
  if (interval === 'yearly') return yearly;
  return monthly;
}
