'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type PlanBillingInterval,
  PRICING_TRIAL_DAYS,
  type BillingPlan,
  landingPriceSecondaryCtaText,
  pricingCardPrimaryCtaLabel,
  pricingPlans,
} from '@/lib/billing/plans';
import { createClient } from '@/lib/supabase/client';
import { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';
import { BillingIntervalToggle } from '@/components/pricing/BillingIntervalToggle';
import { PricingPlanCards } from '@/components/pricing/PricingPlanCards';
import { buildPricingAuthHref, buildPricingNextPath, shouldRouteThroughAuth } from '@/lib/billing/pricing-cta';
import { WaitlistForm } from '@/components/waitlist/WaitlistForm';

export type LandingPricingWaitlistVisibility = 'always-form' | 'anchor-on-narrow';

type LandingPricingSectionProps = {
  /** On viewports below `sm`, show a link to #waitlist instead of a second full form. */
  waitlistVisibility?: LandingPricingWaitlistVisibility;
  /** When false, omit the “Can’t sign up right now?” waitlist block entirely. */
  publicWaitlistEnabled?: boolean;
};

export function LandingPricingSection({
  waitlistVisibility = 'always-form',
  publicWaitlistEnabled = true,
}: LandingPricingSectionProps) {
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
    <section id="pricing" className="scroll-mt-24 border-t border-[var(--sidebar-border)] py-8 sm:py-20 sm:scroll-mt-28">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Simple, predictable pricing
          </h2>
          <p className="mt-3 text-pretty text-sm font-medium text-slate-800 dark:text-slate-200 sm:text-base">
            Start free. Upgrade when you need automation.
          </p>
          <p className="mt-2 text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
            Create invoices in seconds, get paid faster, and stay in control of your revenue.
          </p>
          <p className="mt-4 text-pretty text-xs text-slate-500 dark:text-slate-500 sm:text-sm">
            Free forever plan • {PRICING_TRIAL_DAYS}-day free trial on paid plans • No credit card required
          </p>
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
              const isProfessional = plan.id === 'professional';
              const isStarter = plan.id === 'starter';
              const primaryClassName = isStarter
                ? 'app-btn-secondary inline-flex w-full items-center justify-center py-2.5 text-sm font-semibold'
                : isProfessional
                  ? 'app-btn-primary-lg inline-flex w-full min-h-[48px] items-center justify-center'
                  : 'app-btn-primary inline-flex w-full items-center justify-center py-2.5 text-sm font-semibold';
              return {
                primary: (
                  <Link
                    href={href}
                    onClick={() => logPricingClick(plan.id, href)}
                    className={primaryClassName}
                  >
                    {primaryLabel}
                  </Link>
                ),
                secondary:
                  plan.showTrialCTA === true ? (
                    <Link
                      href={href}
                      onClick={() => logPricingClick(plan.id, href)}
                      className={pricingCardSecondaryCtaClassName}
                    >
                      {landingPriceSecondaryCtaText(plan.id, PRICING_TRIAL_DAYS)}
                    </Link>
                  ) : null,
              };
            }}
          />
        </div>

        <div className="mx-auto mt-14 max-w-3xl border-t border-[var(--sidebar-border)] pt-10 sm:mt-16 sm:pt-12">
          <h3 className="text-center text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
            Stop chasing invoices
          </h3>
          <p className="mt-3 text-pretty text-center text-sm text-slate-600 dark:text-slate-400 sm:text-base">
            {
              "Zenzex helps you automate follow-ups, track what's owed, and stay in control of revenue without spreadsheets or manual reminders."
            }
          </p>
          <ul className="mx-auto mt-6 max-w-md space-y-2.5 text-sm text-slate-600 dark:text-slate-400 sm:mt-7">
            {(
              [
                'Automatically remind clients to pay',
                "Know what's paid, pending, and overdue",
                'Save hours every week on invoicing',
                'Get paid faster with less stress',
              ] as const
            ).map((line) => (
              <li key={line} className="flex gap-2.5 sm:items-start">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
                  aria-hidden
                />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {publicWaitlistEnabled ? (
          waitlistVisibility === 'anchor-on-narrow' ? (
            <>
              <div className="mx-auto mt-12 hidden max-w-lg sm:mt-14 sm:block">
                <p className="mb-3 text-center text-sm font-medium text-slate-700 dark:text-slate-300">
                  Can&apos;t sign up right now?
                </p>
                <WaitlistForm source="pricing" />
              </div>
              <div className="mx-auto mt-10 max-w-lg sm:hidden">
                <p className="mb-3 text-center text-sm font-medium text-slate-700 dark:text-slate-300">
                  Can&apos;t sign up right now?
                </p>
                <a
                  href="#waitlist"
                  className="app-btn-secondary inline-flex w-full min-h-[48px] items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Join the waitlist
                </a>
              </div>
            </>
          ) : (
            <div className="mx-auto mt-12 max-w-lg sm:mt-14">
              <p className="mb-3 text-center text-sm font-medium text-slate-700 dark:text-slate-300">
                Can&apos;t sign up right now?
              </p>
              <WaitlistForm source="pricing" />
            </div>
          )
        ) : null}

        <p className="mt-8 max-w-2xl px-1 text-center text-[11px] text-slate-500 dark:text-slate-500 sm:mt-10 sm:mx-auto sm:text-xs">
          Self-serve checkout. Taxes may apply by region. Cancel or change plans before your trial ends.
        </p>
      </div>
    </section>
  );
}
