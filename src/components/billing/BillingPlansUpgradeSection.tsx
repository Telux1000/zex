'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BillingIntervalToggle } from '@/components/pricing/BillingIntervalToggle';
import { PricingPlanCards } from '@/components/pricing/PricingPlanCards';
import { BillingPlanActionButton } from '@/components/billing/BillingPlanActionButton';
import type { BillingPlan, PlanBillingInterval, PricingPlan } from '@/lib/billing/plans';
import { pricingCardPrimaryCtaLabel, pricingCardSecondaryTrialCtaLabel, pricingTrialMessaging } from '@/lib/billing/plans';
import type { PlanPricingCtaAction } from '@/lib/billing/pricing-cta-action';
import { planPricingCtaTrialAction, planPricingCtaUpgradeAction } from '@/lib/billing/pricing-cta-action';
import type { BillingProviderMode } from '@/lib/billing/saas-billing-config';

export function BillingPlansUpgradeSection({
  plans,
  currentPlan,
  canSwitchPlan,
  requiresPayment,
  trialMessagingHeadline,
  trialDays,
  customerEmail,
  billingProviderMode,
}: {
  plans: PricingPlan[];
  currentPlan: BillingPlan;
  canSwitchPlan: boolean;
  requiresPayment: boolean;
  trialMessagingHeadline: string;
  trialDays: number;
  customerEmail?: string | null;
  billingProviderMode: BillingProviderMode;
}) {
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>('yearly');
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>(currentPlan);
  const loadingActionRef = useRef<PlanPricingCtaAction | null>(null);
  const [loadingAction, setLoadingAction] = useState<PlanPricingCtaAction | null>(null);

  useEffect(() => {
    setSelectedPlan(currentPlan);
  }, [currentPlan]);

  const beginAction = useCallback((id: PlanPricingCtaAction) => {
    if (loadingActionRef.current != null) return false;
    loadingActionRef.current = id;
    setLoadingAction(id);
    return true;
  }, []);

  const clearAction = useCallback(() => {
    loadingActionRef.current = null;
    setLoadingAction(null);
  }, []);

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
          selectedPlanId={selectedPlan}
          onPlanClick={(plan) => {
            setSelectedPlan(plan);
            if (process.env.NODE_ENV !== 'production') {
              console.info(`[pricing] card_selected=${plan}`);
              console.info(`[pricing] selected_plan=${plan}`);
            }
          }}
          renderDualCta={(option) => {
            const current = option.id === currentPlan;
            const isPaidPlan = option.id !== 'starter';
            const primaryCta = requiresPayment
              ? current
                ? 'Pay securely'
                : pricingCardPrimaryCtaLabel(option.id)
              : current
                ? isPaidPlan
                  ? 'Upgrade now'
                  : 'Current plan'
                : pricingCardPrimaryCtaLabel(option.id);
            // Keep paid-plan primary CTA clickable during trial/current plan so users can convert early.
            const planButtonDisabled = current && !requiresPayment && !isPaidPlan;

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
                  embeddedInPricingCard
                  ctaActionId={planPricingCtaUpgradeAction(option.id)}
                  loadingAction={loadingAction}
                  beginAction={beginAction}
                  clearAction={clearAction}
                  billingProviderMode={billingProviderMode}
                />
              ),
              secondary:
                option.showTrialCTA === true ? (
                  <BillingPlanActionButton
                    targetPlan={option.id}
                    cta={current && !requiresPayment ? 'Current trial plan' : secondaryLabel}
                    disabled={planButtonDisabled}
                    popular={false}
                    requiresPayment={requiresPayment}
                    preferInternalTrialAction
                    billingInterval={billingInterval}
                    customerEmail={customerEmail}
                    embeddedInPricingCard
                    trialSecondaryStyle
                    ctaActionId={planPricingCtaTrialAction(option.id)!}
                    loadingAction={loadingAction}
                    beginAction={beginAction}
                    clearAction={clearAction}
                    billingProviderMode={billingProviderMode}
                  />
                ) : null,
            };
          }}
        />
      </div>
    </section>
  );
}
