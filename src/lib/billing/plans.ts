import type { SupabaseClient } from '@supabase/supabase-js';

export type BillingPlan = 'starter' | 'growth' | 'professional' | 'enterprise';
export type PricingPlan = {
  id: BillingPlan;
  name: string;
  /** List price per month before interval discount; 0 for free Starter. */
  priceMonthlyCents: number;
  /**
   * Default Paddle catalog price ID (`pri_*`) for this plan (monthly display).
   * Null for free Starter. Overridden per env via `catalog-price-map` / NEXT_PUBLIC_PADDLE_PRICE_*.
   */
  catalogPriceId: string | null;
  catalogPriceIdMonthly?: string | null;
  catalogPriceIdYearly?: string | null;
  /** True = no paid subscription / no trial checkout for this tier (e.g. Starter). Paddle handles paid tiers. */
  isFree: boolean;
  /** Whether to show the secondary “Start N-day trial” action on pricing cards. */
  showTrialCTA: boolean;
  /** Main price line in cards (e.g. "$0"); optional — otherwise derived from cents. */
  priceDisplay?: string;
  features: string[];
  popular: boolean;
  marketingDescription: string;
};

export type PlanFeature =
  | 'automation'
  | 'ai_assistant'
  | 'voice_screenshot_invoice'
  | 'advanced_insights'
  | 'multi_currency';

const PLAN_RANK: Record<BillingPlan, number> = {
  starter: 0,
  growth: 1,
  professional: 2,
  enterprise: 3,
};

/** Shared trial policy for marketing and billing copy (keep in sync with checkout / Paddle trial if used). */
export const PRICING_TRIAL_DAYS = 14;

export const pricingTrialMessaging = {
  headline: `All plans include a ${PRICING_TRIAL_DAYS}-day free trial`,
  subline: 'No credit card required',
} as const;

/** Landing / billing callout: Starter is free; paid tiers include a trial. */
export function pricingTrialMessagingPaidPlansHeadline(trialDays: number = PRICING_TRIAL_DAYS): string {
  return `Paid plans include a ${trialDays}-day free trial`;
}

/** Onboarding pricing step: explains free Starter vs paid trials. */
export function onboardingPricingSelectionDescription(trialDays: number): string {
  return `Starter is free forever. Paid plans start with a ${trialDays}-day trial — pick a plan to continue. You can change or cancel before the trial ends.`;
}

/** Colored promo box above shared pricing grids (landing, signup pricing, billing). */
export function pricingPromoBannerHeadline(trialDays: number = PRICING_TRIAL_DAYS): string {
  return `Starter is free forever. ${pricingTrialMessagingPaidPlansHeadline(trialDays)}`;
}

/** Primary button label on shared pricing cards (landing, signup pricing, billing grid). All use “Start …”. */
export function pricingCardPrimaryCtaLabel(planId: BillingPlan): string {
  switch (planId) {
    case 'starter':
      return 'Start free';
    case 'growth':
      return 'Start Growth';
    case 'professional':
      return 'Start Professional';
    case 'enterprise':
      return 'Start Enterprise';
    default:
      return 'Start now';
  }
}

/** Secondary trial CTA under the primary button (e.g. “14-day free trial”). */
export function pricingCardSecondaryTrialCtaLabel(trialDays: number = PRICING_TRIAL_DAYS): string {
  return `${trialDays}-day free trial`;
}

export const pricingPlans: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceMonthlyCents: 0,
    catalogPriceId: null,
    catalogPriceIdMonthly: null,
    catalogPriceIdYearly: null,
    isFree: true,
    showTrialCTA: false,
    priceDisplay: '$0',
    features: ['Free forever', 'Core invoicing', 'Monthly usage limits'],
    popular: false,
    marketingDescription: 'Solid foundation for occasional billing.',
  },
  {
    id: 'growth',
    name: 'Growth',
    priceMonthlyCents: 5900,
    catalogPriceId:
      process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH ?? null,
    catalogPriceIdMonthly:
      process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH ?? null,
    catalogPriceIdYearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_YEARLY ?? null,
    isFree: false,
    showTrialCTA: true,
    features: [
      'Everything in Starter with higher limits',
      'Automated payment reminders',
      'Scheduled invoice delivery',
    ],
    popular: false,
    marketingDescription: 'For teams that invoice on a steady cadence.',
  },
  {
    id: 'professional',
    name: 'Professional',
    priceMonthlyCents: 7900,
    catalogPriceId:
      process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL ??
      null,
    catalogPriceIdMonthly:
      process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL ??
      null,
    catalogPriceIdYearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_YEARLY ?? null,
    isFree: false,
    showTrialCTA: true,
    features: [
      'Intelligent invoice creation (text, voice, uploads)',
      'Advanced reporting and built-in insights',
      'Full automation across reminders and delivery',
      'Priority support',
    ],
    popular: true,
    marketingDescription: 'Complete visibility and automation for growing revenue.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthlyCents: 9900,
    catalogPriceId:
      process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE ?? null,
    catalogPriceIdMonthly:
      process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_MONTHLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE ?? null,
    catalogPriceIdYearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_YEARLY ?? null,
    isFree: false,
    showTrialCTA: true,
    features: [
      'Everything in Professional',
      'Higher usage limits',
      'Expanded reporting',
      'Priority support',
      'Team capabilities as they ship',
    ],
    popular: false,
    marketingDescription: 'Extra capacity and support for larger volumes.',
  },
];

export const STARTER_MONTHLY_INVOICE_LIMIT = 10;

export function normalizeBillingPlan(value: unknown): BillingPlan {
  if (value === 'starter' || value === 'growth' || value === 'professional' || value === 'enterprise') {
    return value;
  }
  return 'starter';
}

export function formatPlanMonthlyPrice(plan: BillingPlan): string {
  const row = pricingPlans.find((p) => p.id === plan);
  if (row?.isFree) return row.priceDisplay?.trim() || '$0';
  const cents = row?.priceMonthlyCents ?? pricingPlans[0].priceMonthlyCents;
  return `$${Math.round(cents / 100)}`;
}

/** Shown when "Yearly" billing is selected in marketing / onboarding pricing UIs. */
export const PLAN_PRICE_YEARLY_DISCOUNT_PERCENT = 15;

export type PlanBillingInterval = 'monthly' | 'yearly';

export function normalizePlanBillingInterval(value: unknown): PlanBillingInterval | null {
  if (value === 'monthly' || value === 'yearly') return value;
  return null;
}

export function effectiveMonthlyCentsFromBaseMonthly(
  priceMonthlyCents: number,
  interval: PlanBillingInterval
): number {
  if (interval === 'monthly') return priceMonthlyCents;
  return Math.round(priceMonthlyCents * (1 - PLAN_PRICE_YEARLY_DISCOUNT_PERCENT / 100));
}

export function formatUsdFromCents(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

export function getPricingPlan(plan: BillingPlan): PricingPlan {
  return pricingPlans.find((p) => p.id === plan) ?? pricingPlans[0];
}

export function planIsFree(plan: BillingPlan): boolean {
  return getPricingPlan(plan).isFree;
}

/** Main price amount shown on pricing cards (large bold line before “/mo”). */
export function formatPricingCardMainPrice(plan: PricingPlan, billingInterval: PlanBillingInterval): string {
  if (plan.isFree) return plan.priceDisplay?.trim() || '$0';
  const displayCents = effectiveMonthlyCentsFromBaseMonthly(plan.priceMonthlyCents, billingInterval);
  return formatUsdFromCents(displayCents);
}

export function pricingCardShowsYearlySavingsLine(plan: PricingPlan, billingInterval: PlanBillingInterval): boolean {
  return !plan.isFree && billingInterval === 'yearly';
}

/** Human-readable countdown for trialing accounts; returns null if date missing or invalid. */
export function formatTrialDaysRemaining(trialEndsAtIso: string | null): string | null {
  if (!trialEndsAtIso) return null;
  const end = new Date(trialEndsAtIso).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.ceil(ms / dayMs);
  if (days <= 0) return 'Trial ends today';
  if (days === 1) return 'Trial ends in 1 day';
  return `Trial ends in ${days} days`;
}

export function hasPlanFeature(planRaw: unknown, feature: PlanFeature): boolean {
  const plan = normalizeBillingPlan(planRaw);
  switch (feature) {
    case 'automation':
      return PLAN_RANK[plan] >= PLAN_RANK.growth;
    case 'multi_currency':
      return PLAN_RANK[plan] >= PLAN_RANK.growth;
    case 'ai_assistant':
      return PLAN_RANK[plan] >= PLAN_RANK.professional;
    case 'voice_screenshot_invoice':
      return PLAN_RANK[plan] >= PLAN_RANK.professional;
    case 'advanced_insights':
      return PLAN_RANK[plan] >= PLAN_RANK.professional;
    default:
      return false;
  }
}

export async function getUserBillingPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<BillingPlan> {
  const { data } = await supabase.from('profiles').select('billing_plan').eq('id', userId).maybeSingle();
  return normalizeBillingPlan((data as { billing_plan?: unknown } | null)?.billing_plan);
}

export function featureUpgradeMessage(feature: PlanFeature): string {
  switch (feature) {
    case 'automation':
      return 'Upgrade to Growth to unlock automation.';
    case 'ai_assistant':
      return 'AI Assistant is available on Professional plan.';
    case 'voice_screenshot_invoice':
      return 'Voice and screenshot invoicing are available on Professional plan.';
    case 'advanced_insights':
      return 'Advanced insights are available on Professional plan.';
    case 'multi_currency':
      return 'Upgrade to Growth to unlock multi-currency invoices.';
    default:
      return 'Upgrade to continue.';
  }
}

