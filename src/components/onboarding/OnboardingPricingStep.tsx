'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { openPaddleCheckout, type PaddleCheckoutEventData } from '@/lib/paddle/paddle-browser';

type EntryState = {
  selected_plan: BillingPlan | null;
  selection_status: 'NOT_SELECTED' | 'FREE_SELECTED' | 'TRIAL_SELECTED' | 'PAID_PENDING_CHECKOUT' | 'PAID_ACTIVE';
  subscription_status: string | null;
  onboarding_ready: boolean;
  pending_checkout_plan: BillingPlan | null;
  billing_interval: PlanBillingInterval;
};

type PlanSelectionResponse = EntryState & {
  error?: string;
  checkout_config?: {
    provider: 'paddle';
    price_id: string;
    customer_email: string | null;
    plan_key: BillingPlan;
    billing_interval: PlanBillingInterval;
    owner_user_id?: string;
  };
};

export function OnboardingPricingStep({
  plans,
  trialDays,
  initialEntryState,
  onCompleted,
}: {
  plans: PricingPlan[];
  trialDays: number;
  initialEntryState?: EntryState | null;
  onCompleted: () => void;
}) {
  const [entryState, setEntryState] = useState<EntryState | null>(initialEntryState ?? null);
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>(initialEntryState?.billing_interval ?? 'yearly');
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmingRef = useRef(false);
  const anyLoading = loadingPlan !== null;
  const secondaryLabel = pricingCardSecondaryTrialCtaLabel(trialDays);

  const selectedPlan = useMemo(
    () => entryState?.pending_checkout_plan ?? entryState?.selected_plan ?? null,
    [entryState]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/onboarding-entry-state');
      const data = (await res.json().catch(() => null)) as EntryState | null;
      if (cancelled || !res.ok || !data) return;
      setEntryState(data);
      setBillingInterval(data.billing_interval ?? 'yearly');
      if (data.selection_status === 'PAID_PENDING_CHECKOUT' && data.pending_checkout_plan) {
        const title = data.pending_checkout_plan.charAt(0).toUpperCase() + data.pending_checkout_plan.slice(1);
        setStatusText(`Complete payment to continue with ${title}.`);
      }
      if (data.onboarding_ready) {
        setStatusText('Redirecting to onboarding…');
        onCompleted();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onCompleted]);

  async function confirmPaidCheckout(payload: { transactionId: string | null; subscriptionId: string | null }) {
    const res = await fetch('/api/checkout/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'paddle',
        checkout_reference: payload.transactionId,
        transaction_id: payload.transactionId,
        subscription_id: payload.subscriptionId,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as EntryState & { error?: string };
    if (!res.ok) {
      setEntryState(data);
      setError(data.error ?? 'Your plan is selected. Finish checkout to continue.');
      setStatusText('Your plan is selected. Finish checkout to continue.');
      return;
    }
    setEntryState(data);
    if (data.onboarding_ready) {
      setStatusText('Redirecting to onboarding…');
      onCompleted();
      return;
    }
    setStatusText('Your plan is selected. Finish checkout to continue.');
  }

  function handlePaddleEvent(plan: BillingPlan, event: PaddleCheckoutEventData) {
    const name = String(event?.name ?? '').toLowerCase();
    const data = (event?.data ?? {}) as Record<string, unknown>;
    const transactionId = String(data.transaction_id ?? data.id ?? '').trim() || null;
    const subscriptionId = String(data.subscription_id ?? '').trim() || null;

    if (name.includes('closed')) {
      setStatusText('Your plan is selected. Finish checkout to continue.');
      return;
    }
    if (name.includes('failed')) {
      setError('Payment failed. Your plan is selected. Complete checkout to continue.');
      setStatusText('Your plan is selected. Finish checkout to continue.');
      return;
    }
    if (!name.includes('completed') || confirmingRef.current) return;
    confirmingRef.current = true;
    setStatusText('Payment successful. Confirming subscription…');
    void confirmPaidCheckout({ transactionId, subscriptionId }).finally(() => {
      confirmingRef.current = false;
    });
  }

  async function choosePlan(plan: BillingPlan, mode: 'free' | 'trial' | 'paid') {
    setError(null);
    setStatusText(null);
    setLoadingPlan(plan);
    try {
      const res = await fetch('/api/plan-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_key: plan,
          billing_interval: billingInterval,
          selection_mode: mode,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PlanSelectionResponse;
      if (!res.ok) {
        setError(data.error ?? 'Could not save your plan. Try again.');
        return;
      }

      setEntryState(data);
      if (data.onboarding_ready) {
        setStatusText('Redirecting to onboarding…');
        onCompleted();
        return;
      }

      if (mode !== 'paid') return;

      if (!data.checkout_config?.price_id) {
        setStatusText('Your plan is selected. Finish checkout to continue.');
        setError('Checkout could not be prepared. Please try again.');
        return;
      }

      setStatusText('Opening Paddle checkout…');
      await openPaddleCheckout(data.checkout_config.price_id, data.checkout_config.customer_email ?? undefined, {
        customData: {
          saas_owner_user_id: data.checkout_config.owner_user_id,
          saas_billing_plan: data.checkout_config.plan_key,
        },
        onEvent: (event) => handlePaddleEvent(data.checkout_config!.plan_key, event),
      });
      setStatusText('Your plan is selected. Finish checkout to continue.');
    } finally {
      setLoadingPlan(null);
    }
  }

  function primaryModeForPlan(plan: BillingPlan): 'free' | 'paid' {
    return plan === 'starter' ? 'free' : 'paid';
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
        <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} />
      </div>

      {statusText ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
          {statusText}
        </div>
      ) : null}

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
        currentPlanId={selectedPlan}
        renderDualCta={(plan: PricingPlan) => {
          const busy = loadingPlan === plan.id;
          return {
            primary: (
              <button
                type="button"
                disabled={anyLoading}
                onClick={() => void choosePlan(plan.id, primaryModeForPlan(plan.id))}
                className="app-btn-primary inline-flex w-full items-center justify-center py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Saving…' : pricingCardPrimaryCtaLabel(plan.id)}
              </button>
            ),
            secondary:
              plan.showTrialCTA === true && plan.id !== 'starter' ? (
                <button
                  type="button"
                  disabled={anyLoading}
                  onClick={() => void choosePlan(plan.id, 'trial')}
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
