'use client';

import { useState } from 'react';
import { BillingIntervalToggle } from '@/components/pricing/BillingIntervalToggle';
import { PricingPlanCards } from '@/components/pricing/PricingPlanCards';
import { BillingPlanActionButton } from '@/components/billing/BillingPlanActionButton';
import type { BillingPlan, PlanBillingInterval, PricingPlan } from '@/lib/billing/plans';
import { pricingCardPrimaryCtaLabel, pricingCardSecondaryTrialCtaLabel, pricingTrialMessaging } from '@/lib/billing/plans';

export function BillingPlansUpgradeSection({
  plans,
  currentPlan,
  currentSubscriptionStatus,
  canSwitchPlan,
  requiresPayment,
  trialMessagingHeadline,
  trialDays,
  customerEmail,
}: {
  plans: PricingPlan[];
  currentPlan: BillingPlan;
  currentSubscriptionStatus: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'trial_expired';
  canSwitchPlan: boolean;
  requiresPayment: boolean;
  trialMessagingHeadline: string;
  trialDays: number;
  customerEmail?: string | null;
}) {
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>('yearly');
  const [busyRowPlan, setBusyRowPlan] = useState<BillingPlan | null>(null);

  const secondaryLabel = pricingCardSecondaryTrialCtaLabel(trialDays);

  return (
    <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Upgrade or downgrade</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Plan changes do not reset your trial — same trial end date for your account
        </p>
      </div>
      <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-950/40">
        <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{trialMessagingHeadline}</p>
        <p className="mt-1 text-xs text-indigo-800/90 dark:text-indigo-200/85">{pricingTrialMessaging.subline}</p>
      </div>
      <div className="mt-5 flex justify-center sm:justify-end">
        <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} />
      </div>
      {!canSwitchPlan && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Only the workspace owner can change the subscription plan. You can still review options below.
        </p>
      )}
      <div className="mt-6">
        <PricingPlanCards
          plans={plans}
          billingInterval={billingInterval}
          currentPlanId={currentPlan}
          renderDualCta={(option) => {
            const current = option.id === currentPlan;
            const isTrialing = currentSubscriptionStatus === 'trialing';
            const isPaidPlan = option.isFree === false;
            const primaryCta = requiresPayment
              ? current
                ? 'Pay & activate'
                : pricingCardPrimaryCtaLabel(option.id)
              : isTrialing && current && isPaidPlan
                ? `Upgrade to ${option.name}`
                : current
                  ? 'Current plan'
                : pricingCardPrimaryCtaLabel(option.id);
            // During trial we allow immediate paid conversion on any paid plan (including current).
            const planButtonDisabled = requiresPayment ? false : isTrialing ? false : current;

            if (!canSwitchPlan) {
              return {
                primary: (
                  <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                    {current ? 'Current plan' : 'Owner manages plan changes'}
                  </p>
                ),
                secondary: null,
              };
            }

            return {
              primary: (
                <BillingPlanActionButton
                  targetPlan={option.id}
                  cta={primaryCta}
                  disabled={planButtonDisabled}
                  popular
                  requiresPayment={requiresPayment}
                  billingInterval={billingInterval}
                  customerEmail={customerEmail}
                  userStatus={currentSubscriptionStatus}
                  embeddedInPricingCard
                  busyRowPlan={busyRowPlan}
                  onBusyPlanChange={setBusyRowPlan}
                />
              ),
              secondary:
                option.showTrialCTA === true ? (
                  <BillingPlanActionButton
                    targetPlan={option.id}
                    cta={secondaryLabel}
                    disabled={planButtonDisabled}
                    popular={false}
                    requiresPayment={requiresPayment}
                    preferInternalTrialAction={currentSubscriptionStatus !== 'trialing'}
                    billingInterval={billingInterval}
                    customerEmail={customerEmail}
                    userStatus={currentSubscriptionStatus}
                    embeddedInPricingCard
                    trialSecondaryStyle
                    busyRowPlan={busyRowPlan}
                    onBusyPlanChange={setBusyRowPlan}
                  />
                ) : null,
            };
          }}
        />
      </div>
    </section>
  );
}
