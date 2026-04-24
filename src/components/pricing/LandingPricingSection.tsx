'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
import { createClient } from '@/lib/supabase/client';
import { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';
import { BillingIntervalToggle } from '@/components/pricing/BillingIntervalToggle';
import { PricingPlanCards } from '@/components/pricing/PricingPlanCards';
import { buildPricingAuthHref, buildPricingNextPath, shouldRouteThroughAuth } from '@/lib/billing/pricing-cta';

export function LandingPricingSection() {
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>('monthly');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isDev = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (active) setIsAuthenticated(Boolean(data.session));
    };
    void loadSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setIsAuthenticated(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  function pricingCtaHref(plan: BillingPlan) {
    if (!shouldRouteThroughAuth(plan)) {
      return `/signup?${new URLSearchParams({ plan, billing: billingInterval }).toString()}`;
    }
    if (isAuthenticated) {
      return buildPricingNextPath(plan, billingInterval);
    }
    return buildPricingAuthHref('/login', plan, billingInterval);
  }

  function logPricingClick(plan: BillingPlan, href: string) {
    if (!isDev) return;
    console.info('[PricingCTA][Landing] click', {
      route: typeof window !== 'undefined' ? window.location.pathname : '/',
      auth: isAuthenticated ? 'authenticated' : 'anonymous',
      plan,
      billingCycle: billingInterval,
      action: shouldRouteThroughAuth(plan)
        ? isAuthenticated
          ? 'route_to_onboarding_trial'
          : 'route_to_auth'
        : 'route_to_signup',
      href,
    });
  }

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-[var(--sidebar-border)] py-12 sm:py-20">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Predictable pricing
          </h2>
          <p className="mt-3 text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
            Straightforward plans with clear limits. Upgrade when you need more automation and scale.
          </p>
          <div className="mx-auto mt-5 max-w-lg rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-2.5 dark:border-indigo-500/30 dark:bg-indigo-950/40 sm:px-4 sm:py-3">
            <p className="text-pretty text-xs font-semibold text-indigo-900 dark:text-indigo-100 sm:text-sm">
              {pricingPromoBannerHeadline(PRICING_TRIAL_DAYS)}
            </p>
            <p className="mt-1 text-pretty text-[11px] text-indigo-800/90 dark:text-indigo-200/85 sm:text-xs">
              {pricingTrialMessaging.subline}
            </p>
          </div>
          <div className="mt-5 flex w-full justify-center px-1 sm:mt-6 sm:px-0">
            <BillingIntervalToggle
              value={billingInterval}
              onChange={setBillingInterval}
              className="w-full max-w-xs sm:w-auto"
            />
          </div>
        </div>

        <div className="mt-8 sm:mt-10">
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

        <p className="mt-8 max-w-2xl px-1 text-center text-[11px] text-slate-500 dark:text-slate-500 sm:mt-10 sm:mx-auto sm:text-xs">
          Self-serve checkout. Taxes may apply by region. Cancel or change plans before your trial ends.
        </p>
      </div>
    </section>
  );
}
