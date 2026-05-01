import type { BillingPlan } from '@/lib/billing/plans';

type PaidPlan = Exclude<BillingPlan, 'starter'>;

export type PlanPricingCtaAction =
  | 'starter_upgrade'
  | `${PaidPlan}_upgrade`
  | `${PaidPlan}_trial`;

export function planPricingCtaUpgradeAction(plan: BillingPlan): PlanPricingCtaAction {
  return `${plan}_upgrade` as PlanPricingCtaAction;
}

export function planPricingCtaTrialAction(plan: BillingPlan): PlanPricingCtaAction | null {
  if (plan === 'starter') return null;
  return `${plan}_trial` as PlanPricingCtaAction;
}
