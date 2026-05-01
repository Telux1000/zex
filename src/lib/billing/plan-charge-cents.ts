import {
  PLAN_PRICE_YEARLY_DISCOUNT_PERCENT,
  getPricingPlan,
  planIsFree,
  type BillingPlan,
  type PlanBillingInterval,
} from '@/lib/billing/plans';

/** Total to charge in USD minor units (cents) for a plan/interval. */
export function planTotalCentsForInterval(
  plan: BillingPlan,
  interval: PlanBillingInterval
): number {
  if (planIsFree(plan)) return 0;
  const p = getPricingPlan(plan);
  if (interval === 'yearly' && p.billedAnnuallyTotalCents != null) {
    return p.billedAnnuallyTotalCents;
  }
  if (interval === 'yearly') {
    return Math.round(p.priceMonthlyCents * 12 * (1 - PLAN_PRICE_YEARLY_DISCOUNT_PERCENT / 100));
  }
  return p.priceMonthlyCents;
}
