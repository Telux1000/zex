import { planIsFree, type BillingPlan, type PlanBillingInterval } from '@/lib/billing/plans';

/**
 * Public catalog price IDs for marketing / trial lock.
 * Prefer `NEXT_PUBLIC_CATALOG_PRICE_*`; legacy `NEXT_PUBLIC_PADDLE_PRICE_*` is still read.
 */
const MONTHLY_ENV: Record<BillingPlan, string | undefined> = {
  starter:
    process.env.NEXT_PUBLIC_CATALOG_PRICE_STARTER_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY,
  growth:
    process.env.NEXT_PUBLIC_CATALOG_PRICE_GROWTH_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY,
  professional:
    process.env.NEXT_PUBLIC_CATALOG_PRICE_PROFESSIONAL_MONTHLY ??
    process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_MONTHLY,
  enterprise:
    process.env.NEXT_PUBLIC_CATALOG_PRICE_ENTERPRISE_MONTHLY ??
    process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_MONTHLY,
};

const YEARLY_ENV: Record<BillingPlan, string | undefined> = {
  starter: process.env.NEXT_PUBLIC_CATALOG_PRICE_STARTER_YEARLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEARLY,
  growth: process.env.NEXT_PUBLIC_CATALOG_PRICE_GROWTH_YEARLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_YEARLY,
  professional:
    process.env.NEXT_PUBLIC_CATALOG_PRICE_PROFESSIONAL_YEARLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_YEARLY,
  enterprise:
    process.env.NEXT_PUBLIC_CATALOG_PRICE_ENTERPRISE_YEARLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_YEARLY,
};

let envValidationLogged = false;

function trimId(id: string | undefined | null): string | null {
  const t = id?.trim();
  return t ? t : null;
}

function monthlyWithLegacy(plan: BillingPlan): string | null {
  const fromCatalog = trimId(MONTHLY_ENV[plan]);
  if (fromCatalog) return fromCatalog;
  if (plan === 'starter') return null;
  const u = plan.toUpperCase() as 'GROWTH' | 'PROFESSIONAL' | 'ENTERPRISE';
  return trimId(process.env[`NEXT_PUBLIC_PADDLE_PRICE_${u}` as 'NEXT_PUBLIC_PADDLE_PRICE_GROWTH']);
}

/** Locked catalog price ID for display / trial; null if not configured or plan is free. */
export function catalogPriceIdForPlanInterval(
  plan: BillingPlan,
  interval: PlanBillingInterval
): string | null {
  if (planIsFree(plan)) return null;
  const monthly = monthlyWithLegacy(plan);
  const yearly = trimId(YEARLY_ENV[plan]) ?? monthly;
  if (interval === 'yearly') return yearly;
  return monthly;
}

/** Dev-only: warn when public marketing price envs are missing (client). */
export function validatePublicCatalogPriceEnv(): void {
  if (envValidationLogged || typeof window === 'undefined') return;
  envValidationLogged = true;
  const plans: BillingPlan[] = ['growth', 'professional', 'enterprise'];
  for (const plan of plans) {
    const monthly = catalogPriceIdForPlanInterval(plan, 'monthly');
    const yearly = catalogPriceIdForPlanInterval(plan, 'yearly');
    if (!monthly) {
      console.error(
        `[Billing] Missing monthly catalog price for ${plan}. Set NEXT_PUBLIC_CATALOG_PRICE_${plan.toUpperCase()}_MONTHLY.`
      );
    }
    if (!yearly) {
      console.error(
        `[Billing] Missing yearly catalog price for ${plan}. Set NEXT_PUBLIC_CATALOG_PRICE_${plan.toUpperCase()}_YEARLY.`
      );
    }
  }
}

/** Reverse lookup for webhooks (subscription line items). */
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
