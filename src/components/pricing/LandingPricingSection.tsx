'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  type PlanBillingInterval,
  PRICING_TRIAL_DAYS,
  planIsFree,
  pricingCardPrimaryCtaLabel,
  pricingCardSecondaryTrialCtaLabel,
  pricingPlans,
  pricingPromoBannerHeadline,
  pricingTrialMessaging,
} from '@/lib/billing/plans';
import { catalogPriceIdForPlanInterval } from '@/lib/billing/catalog-price-map';
import { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';
import { BillingIntervalToggle } from '@/components/pricing/BillingIntervalToggle';
import { PricingPlanCards } from '@/components/pricing/PricingPlanCards';
import { SubscribeButton } from '@/components/paddle/SubscribeButton';

export function LandingPricingSection() {
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>('yearly');

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-[var(--sidebar-border)] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            Fixed prices, no surprises. Choose a plan and get started in minutes.
          </p>
          <div className="mx-auto mt-5 max-w-lg rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-950/40">
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
              {pricingPromoBannerHeadline(PRICING_TRIAL_DAYS)}
            </p>
            <p className="mt-1 text-xs text-indigo-800/90 dark:text-indigo-200/85">
              {pricingTrialMessaging.subline}
            </p>
          </div>
          <div className="mt-6 flex justify-center">
            <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} />
          </div>
        </div>

        <div className="mt-10">
          <PricingPlanCards
            plans={pricingPlans}
            billingInterval={billingInterval}
            renderDualCta={(plan) => {
              const signupHref = `/signup?${new URLSearchParams({
                plan: plan.id,
                billing: billingInterval,
              }).toString()}`;
              const priceId = catalogPriceIdForPlanInterval(plan.id, billingInterval);
              const primaryLabel = pricingCardPrimaryCtaLabel(plan.id);
              const paidPlan = !planIsFree(plan.id);
              return {
                primary: (
                  paidPlan ? (
                    <SubscribeButton
                      priceId={priceId ?? ''}
                      label={primaryLabel}
                      billingCycle={billingInterval}
                      className="app-btn-primary inline-flex w-full items-center justify-center py-2.5 text-sm font-semibold"
                      disabled={!priceId}
                    />
                  ) : (
                    <Link
                      href={signupHref}
                      className="app-btn-primary inline-flex w-full items-center justify-center py-2.5 text-sm font-semibold"
                    >
                      {primaryLabel}
                    </Link>
                  )
                ),
                secondary:
                  plan.showTrialCTA === true ? (
                    paidPlan ? (
                      <SubscribeButton
                        priceId={priceId ?? ''}
                        label={pricingCardSecondaryTrialCtaLabel()}
                        billingCycle={billingInterval}
                        className={pricingCardSecondaryCtaClassName}
                        disabled={!priceId}
                      />
                    ) : (
                      <Link href={signupHref} className={pricingCardSecondaryCtaClassName}>
                        {pricingCardSecondaryTrialCtaLabel()}
                      </Link>
                    )
                  ) : null,
              };
            }}
          />
        </div>

        <p className="mt-10 text-center text-xs text-slate-500 dark:text-slate-500">
          All plans are self-serve. Taxes may apply by region.
        </p>
      </div>
    </section>
  );
}
