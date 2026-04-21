'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  type PlanBillingInterval,
  PRICING_TRIAL_DAYS,
  type BillingPlan,
  pricingCardPrimaryCtaLabel,
  pricingCardSecondaryTrialCtaLabel,
  pricingPlans,
  pricingPromoBannerHeadline,
  pricingTrialMessaging,
} from '@/lib/billing/plans';
import { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';
import { BillingIntervalToggle } from '@/components/pricing/BillingIntervalToggle';
import { PricingPlanCards } from '@/components/pricing/PricingPlanCards';
import { buildPricingAuthHref, shouldRouteThroughAuth } from '@/lib/billing/pricing-cta';

export function LandingPricingSection() {
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>('yearly');
  const isDev = process.env.NODE_ENV !== 'production';

  function pricingCtaHref(plan: BillingPlan) {
    if (!shouldRouteThroughAuth(plan)) {
      return `/signup?${new URLSearchParams({ plan, billing: billingInterval }).toString()}`;
    }
    // Public landing CTA for paid plans should always go through auth intent first.
    return buildPricingAuthHref('/login', plan, billingInterval);
  }

  function logPricingClick(plan: BillingPlan, href: string) {
    if (!isDev) return;
    console.info('[PricingCTA][Landing] click', {
      route: typeof window !== 'undefined' ? window.location.pathname : '/',
      auth: 'public-landing',
      plan,
      billingCycle: billingInterval,
      href,
    });
  }

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
              const href = pricingCtaHref(plan.id);
              const primaryLabel = pricingCardPrimaryCtaLabel(plan.id);
              return {
                primary: (
                  <Link
                    href={href}
                    onClick={() => logPricingClick(plan.id, href)}
                    className="app-btn-primary inline-flex w-full items-center justify-center py-2.5 text-sm font-semibold"
                  >
                    {primaryLabel}
                  </Link>
                ),
                secondary:
                  plan.showTrialCTA === true ? (
                    <Link href={href} onClick={() => logPricingClick(plan.id, href)} className={pricingCardSecondaryCtaClassName}>
                      {pricingCardSecondaryTrialCtaLabel()}
                    </Link>
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
