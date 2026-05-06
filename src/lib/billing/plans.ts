import type { SupabaseClient } from '@supabase/supabase-js';
import { profileDisplayNameFromProfileRow } from '@/lib/audit-log';

export type BillingPlan = 'starter' | 'growth' | 'professional' | 'enterprise';
export type PricingPlan = {
  id: BillingPlan;
  name: string;
  /** List price per month before interval discount; 0 for free Starter. */
  priceMonthlyCents: number;
  /**
   * When set, yearly display uses this all-in total (cents) instead of deriving from the % discount.
   */
  billedAnnuallyTotalCents?: number;
  /** Appended to the main price in cards (e.g. "+" for "$79+"). */
  listPriceSuffix?: string;
  /**
   * Public catalog price ID for this plan (e.g. monthly). Null for free Starter.
   * Overridden per env: `catalog-price-map` / NEXT_PUBLIC_CATALOG_PRICE_*.
   */
  catalogPriceId: string | null;
  catalogPriceIdMonthly?: string | null;
  catalogPriceIdYearly?: string | null;
  /** True = no paid subscription / no trial checkout for this tier (e.g. Starter). */
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
  | 'multi_currency'
  | 'teams'
  | 'api_access';

const PLAN_RANK: Record<BillingPlan, number> = {
  starter: 0,
  growth: 1,
  professional: 2,
  enterprise: 3,
};

/** Shared trial policy for marketing and billing copy. */
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
  return `Starter is free forever. Paid plans start with a ${trialDays}-day trial — one trial per account. Pick a plan to continue, and cancel anytime from billing settings.`;
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
      return 'Start Growth plan';
    case 'professional':
      return 'Upgrade to Professional';
    case 'enterprise':
      return 'Start Enterprise';
    default:
      return 'Start now';
  }
}

/** Billing / post-trial upgrade row: “Upgrade to Growth”, etc. */
export function pricingCardBillingUpgradeCtaLabel(planId: BillingPlan): string {
  switch (planId) {
    case 'growth':
      return 'Upgrade to Growth';
    case 'professional':
      return 'Upgrade to Professional';
    case 'enterprise':
      return 'Upgrade to Enterprise';
    default:
      return 'Upgrade';
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
    features: ['Core invoicing', 'Up to 5 invoices/month', 'Basic payment tracking'],
    popular: false,
    marketingDescription: 'For getting started',
  },
  {
    id: 'growth',
    name: 'Growth',
    priceMonthlyCents: 1900,
    billedAnnuallyTotalCents: 18_000,
    catalogPriceId:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_GROWTH_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH ??
      null,
    catalogPriceIdMonthly:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_GROWTH_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH ??
      null,
    catalogPriceIdYearly:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_GROWTH_YEARLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_YEARLY ?? null,
    isFree: false,
    showTrialCTA: true,
    features: [
      'Invoice reminders and scheduled follow-ups',
      'Smart invoice creation (text, voice, or upload)',
      'Real-time payment tracking',
      'Unlimited invoices',
    ],
    popular: false,
    marketingDescription: 'For freelancers getting paid regularly',
  },
  {
    id: 'professional',
    name: 'Professional',
    priceMonthlyCents: 3900,
    billedAnnuallyTotalCents: 36_000,
    catalogPriceId:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_PROFESSIONAL_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL ??
      null,
    catalogPriceIdMonthly:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_PROFESSIONAL_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL ??
      null,
    catalogPriceIdYearly:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_PROFESSIONAL_YEARLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_PROFESSIONAL_YEARLY ?? null,
    isFree: false,
    showTrialCTA: true,
    features: [
      'Everything in Growth',
      'Multi-currency (FX) invoicing & reporting',
      'Advanced revenue insights & forecasting',
      'Priority support',
    ],
    popular: true,
    marketingDescription: 'For serious businesses scaling revenue',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthlyCents: 7900,
    billedAnnuallyTotalCents: 72_000,
    listPriceSuffix: '+',
    catalogPriceId:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_ENTERPRISE_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE ??
      null,
    catalogPriceIdMonthly:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_ENTERPRISE_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_MONTHLY ??
      process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE ??
      null,
    catalogPriceIdYearly:
      process.env.NEXT_PUBLIC_CATALOG_PRICE_ENTERPRISE_YEARLY ?? process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE_YEARLY ?? null,
    isFree: false,
    showTrialCTA: true,
    features: [
      'Everything in Professional',
      'Team roles, seats, and access controls',
      'API access for custom integrations & workflows',
      'Dedicated onboarding & custom limits',
    ],
    popular: false,
    marketingDescription: 'For teams and advanced workflows',
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
  return `${formatUsdFromCents(cents)}${row?.listPriceSuffix ?? ''}`;
}

/** Shown when "Yearly" billing is selected in marketing / onboarding pricing UIs. */
export const PLAN_PRICE_YEARLY_DISCOUNT_PERCENT = 20;

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

/**
 * Main price amount shown on pricing cards (large bold line before “/mo”),
 * without an optional list suffix (see `formatPricingCardMainPriceParts`).
 */
export function formatPricingCardMainPrice(plan: PricingPlan, billingInterval: PlanBillingInterval): string {
  return formatPricingCardMainPriceParts(plan, billingInterval).amount;
}

export function formatPricingCardMainPriceParts(
  plan: PricingPlan,
  billingInterval: PlanBillingInterval
): { amount: string; suffix: string } {
  const suffix = plan.listPriceSuffix ?? '';
  if (plan.isFree) {
    return { amount: plan.priceDisplay?.trim() || '$0', suffix: '' };
  }
  if (billingInterval === 'yearly' && plan.billedAnnuallyTotalCents != null) {
    return {
      amount: formatUsdFromCents(Math.round(plan.billedAnnuallyTotalCents / 12)),
      suffix,
    };
  }
  if (billingInterval === 'yearly') {
    const displayCents = effectiveMonthlyCentsFromBaseMonthly(plan.priceMonthlyCents, 'yearly');
    return { amount: formatUsdFromCents(displayCents), suffix };
  }
  return { amount: formatUsdFromCents(plan.priceMonthlyCents), suffix };
}

/**
 * Yearly plan savings vs paying monthly for 12 months (for marketing display).
 * When `billedAnnuallyTotalCents` is set, uses that; otherwise the yearly discount %.
 */
export function formatYearlySavingsComparedToMonthlyBilling(plan: PricingPlan): string | null {
  if (plan.isFree) return null;
  if (plan.billedAnnuallyTotalCents != null) {
    const savingsCents = plan.priceMonthlyCents * 12 - plan.billedAnnuallyTotalCents;
    if (savingsCents <= 0) return null;
    return `Save ${formatUsdFromCents(savingsCents)}/year`;
  }
  const perMonthCents = plan.priceMonthlyCents;
  const yearlyPerMonthCents = effectiveMonthlyCentsFromBaseMonthly(perMonthCents, 'yearly');
  const savingsCents = perMonthCents * 12 - yearlyPerMonthCents * 12;
  if (savingsCents <= 0) return null;
  return `Save ${formatUsdFromCents(savingsCents)}/year`;
}

/** Secondary CTA subtext for the marketing / landing pricing section (per plan, same href as primary for paid plans). */
export function landingPriceSecondaryCtaText(plan: BillingPlan, trialDays: number = PRICING_TRIAL_DAYS): string {
  if (plan === 'growth') {
    return `${trialDays}-day free trial · No card required`;
  }
  return `${trialDays}-day free trial`;
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

/** Short copy for pricing cards (e.g. “7 days left”). */
export function formatTrialDaysRemainingShort(
  trialEndsAtIso: string | null,
  nowMs: number = Date.now()
): string | null {
  if (!trialEndsAtIso) return null;
  const end = new Date(trialEndsAtIso).getTime();
  if (Number.isNaN(end)) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.ceil((end - nowMs) / dayMs);
  if (days <= 0) return 'Trial ends today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

export function hasPlanFeature(planRaw: unknown, feature: PlanFeature): boolean {
  const plan = normalizeBillingPlan(planRaw);
  switch (feature) {
    case 'automation':
      return PLAN_RANK[plan] >= PLAN_RANK.growth;
    case 'ai_assistant':
      return PLAN_RANK[plan] >= PLAN_RANK.growth;
    case 'voice_screenshot_invoice':
      return PLAN_RANK[plan] >= PLAN_RANK.growth;
    case 'multi_currency':
      return PLAN_RANK[plan] >= PLAN_RANK.professional;
    case 'advanced_insights':
      return PLAN_RANK[plan] >= PLAN_RANK.professional;
    case 'teams':
      return PLAN_RANK[plan] >= PLAN_RANK.enterprise;
    case 'api_access':
      return PLAN_RANK[plan] >= PLAN_RANK.enterprise;
    default:
      return false;
  }
}

export async function getUserBillingPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<BillingPlan> {
  const { getOwnerBillingPlanAfterReconcile } = await import('@/lib/billing/subscription-access');
  return getOwnerBillingPlanAfterReconcile(supabase, userId);
}

/**
 * One profiles row read for invoice POST (replaces separate resolveActorDisplayName + getUserBillingPlan).
 * Same RLS; same data as two selects combined.
 */
export async function fetchActorLabelAndBillingPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<{ actorLabel: string | null; billingPlan: BillingPlan }> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email, billing_plan')
    .eq('id', userId)
    .maybeSingle();
  const label = profileDisplayNameFromProfileRow(
    data as { full_name?: string | null; email?: string | null } | null
  );
  if (label) {
    return {
      actorLabel: label,
      billingPlan: normalizeBillingPlan((data as { billing_plan?: unknown } | null)?.billing_plan),
    };
  }
  return {
    actorLabel: data ? 'User' : null,
    billingPlan: normalizeBillingPlan((data as { billing_plan?: unknown } | null)?.billing_plan),
  };
}

export function featureUpgradeMessage(feature: PlanFeature): string {
  switch (feature) {
    case 'automation':
      return 'Upgrade to Growth to unlock automation.';
    case 'ai_assistant':
      return 'Upgrade to Growth to unlock the AI assistant and intelligent invoicing.';
    case 'voice_screenshot_invoice':
      return 'Upgrade to Growth to unlock voice and image invoice creation.';
    case 'advanced_insights':
      return 'Advanced insights are available on Professional and above.';
    case 'multi_currency':
      return 'Multi-currency invoicing is available on Professional and above.';
    case 'teams':
      return 'Team management and invited seats are available on Enterprise.';
    case 'api_access':
      return 'API access is available on Enterprise.';
    default:
      return 'Upgrade to continue.';
  }
}

