import { type BillingPlan, type PlanBillingInterval } from '@/lib/billing/plans';

export const PRICING_AUTH_NEXT_BASE = '/onboarding?step=pricing';

function isPaidPlan(plan: BillingPlan): boolean {
  return plan === 'growth' || plan === 'professional' || plan === 'enterprise';
}

export function normalizeBillingIntervalParam(value: string | null | undefined): PlanBillingInterval {
  return value === 'monthly' ? 'monthly' : 'yearly';
}

export function buildPricingNextPath(plan: BillingPlan, billing: PlanBillingInterval): string {
  const params = new URLSearchParams({
    step: 'pricing',
    plan,
    billing,
  });
  return `/onboarding?${params.toString()}`;
}

export function buildPricingAuthHref(pathname: '/login' | '/signup', plan: BillingPlan, billing: PlanBillingInterval): string {
  const params = new URLSearchParams({
    plan,
    billing,
    next: buildPricingNextPath(plan, billing),
  });
  return `${pathname}?${params.toString()}`;
}

export function shouldRouteThroughAuth(plan: BillingPlan): boolean {
  return isPaidPlan(plan);
}
