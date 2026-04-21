'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BillingIntervalToggle } from '@/components/pricing/BillingIntervalToggle';
import { PricingPlanCards } from '@/components/pricing/PricingPlanCards';
import { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';
import type { BillingPlan, PlanBillingInterval, PricingPlan } from '@/lib/billing/plans';
import {
  onboardingPricingSelectionDescription,
  pricingCardPrimaryCtaLabel,
  pricingCardSecondaryTrialCtaLabel,
  pricingPromoBannerHeadline,
  pricingTrialMessaging,
} from '@/lib/billing/plans';
import { catalogPriceIdForPlanInterval } from '@/lib/billing/catalog-price-map';
import { normalizeBillingIntervalParam } from '@/lib/billing/pricing-cta';

const BILLING_INTERVAL_KEY = 'zenzex-onboarding-billing-interval';
const SELECTED_PLAN_KEY = 'zenzex-onboarding-selected-plan';

export function OnboardingPricingStep({
  plans,
  trialDays,
  onCompleted,
}: {
  plans: PricingPlan[];
  trialDays: number;
  onCompleted: () => void;
}) {
  const searchParams = useSearchParams();
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>('yearly');
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV !== 'production';

  const anyLoading = loadingPlan !== null;
  const secondaryLabel = pricingCardSecondaryTrialCtaLabel(trialDays);

  useEffect(() => {
    const plan = searchParams.get('plan');
    const interval = normalizeBillingIntervalParam(searchParams.get('billing'));
    if (plan === 'growth' || plan === 'professional' || plan === 'enterprise' || plan === 'starter') {
      try {
        sessionStorage.setItem(SELECTED_PLAN_KEY, plan);
        sessionStorage.setItem(BILLING_INTERVAL_KEY, interval);
      } catch {
        /* ignore */
      }
      setBillingInterval(interval);
    }
  }, [searchParams]);

  function persistInterval(interval: PlanBillingInterval) {
    setBillingInterval(interval);
    try {
      sessionStorage.setItem(BILLING_INTERVAL_KEY, interval);
    } catch {
      /* ignore */
    }
  }

  function persistPlanChoice(plan: BillingPlan) {
    try {
      sessionStorage.setItem(SELECTED_PLAN_KEY, plan);
      sessionStorage.setItem(BILLING_INTERVAL_KEY, billingInterval);
    } catch {
      /* ignore */
    }
  }

  async function startTrialForPlan(plan: BillingPlan) {
    setError(null);
    persistPlanChoice(plan);
    setLoadingPlan(plan);
    try {
      const res = await fetch('/api/onboarding/commit-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billing_interval: billingInterval }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Could not save your plan. Try again.');
        return;
      }
      onCompleted();
    } finally {
      setLoadingPlan(null);
    }
  }

  async function startCheckoutForPlan(plan: BillingPlan) {
    setError(null);
    persistPlanChoice(plan);
    const resolvedPriceId = catalogPriceIdForPlanInterval(plan, billingInterval);
    if (!resolvedPriceId) {
      setError('This plan is missing a Paddle price ID for the selected billing interval.');
      console.error('[PricingCTA][Onboarding] Missing priceId.', { plan, billingInterval });
      return;
    }

    if (isDev) {
      console.info('[PricingCTA][Onboarding] checkout click', {
        route: typeof window !== 'undefined' ? window.location.pathname : '/onboarding',
        auth: 'authenticated',
        plan,
        billingCycle: billingInterval,
        priceId: resolvedPriceId,
        paddleInitialized: typeof window !== 'undefined' && Boolean(window.Paddle),
      });
    }

    setLoadingPlan(plan);
    try {
      const res = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billing_interval: billingInterval }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !j.url) {
        const msg = typeof j.error === 'string' ? j.error : 'Could not start Paddle checkout.';
        setError(msg);
        console.error('[PricingCTA][Onboarding] checkout failed', { plan, billingInterval, msg });
        return;
      }
      window.location.assign(j.url);
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          Choose a pricing plan
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-pretty text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {onboardingPricingSelectionDescription(trialDays)}
        </p>
      </div>

      <div className="mx-auto max-w-2xl rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-950/40">
        <p className="text-center text-sm font-semibold text-indigo-900 dark:text-indigo-100">
          {pricingPromoBannerHeadline(trialDays)}
        </p>
        <p className="mt-1 text-center text-xs text-indigo-800/90 dark:text-indigo-200/85">
          {pricingTrialMessaging.subline}
        </p>
      </div>

      <div className="flex justify-center">
        <BillingIntervalToggle value={billingInterval} onChange={persistInterval} />
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      <PricingPlanCards
        plans={plans}
        billingInterval={billingInterval}
        renderDualCta={(plan: PricingPlan) => {
          const busy = loadingPlan === plan.id;
          const openFlow = plan.isFree ? () => void startTrialForPlan(plan.id) : () => void startCheckoutForPlan(plan.id);
          return {
            primary: (
              <button
                type="button"
                disabled={anyLoading}
                onClick={openFlow}
                className="app-btn-primary inline-flex w-full items-center justify-center py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Saving…' : pricingCardPrimaryCtaLabel(plan.id)}
              </button>
            ),
            secondary:
              plan.showTrialCTA === true ? (
                <button
                  type="button"
                  disabled={anyLoading}
                  onClick={openFlow}
                  className={`${pricingCardSecondaryCtaClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {busy ? 'Saving…' : secondaryLabel}
                </button>
              ) : null,
          };
        }}
      />
    </div>
  );
}
