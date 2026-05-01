'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import {
  completeBillingCheckoutResponse,
  requestBillingCheckout,
  type BillingCheckoutClientTimings,
  type CheckoutWaitlistPayload,
} from '@/lib/billing/client-checkout';
import { billingCheckoutPerfEnabled, billingCheckoutPerfLog } from '@/lib/billing/billing-checkout-perf';
import {
  CheckoutRedirectSubtleOverlay,
  useCheckoutRedirectOverlay,
} from '@/components/billing/CheckoutRedirectSubtleOverlay';
import type { PlanPricingCtaAction } from '@/lib/billing/pricing-cta-action';
import { planPricingCtaTrialAction, planPricingCtaUpgradeAction } from '@/lib/billing/pricing-cta-action';
import { CardProviderChoiceModal } from '@/components/billing/CardProviderChoiceModal';
import { cardCheckoutProviderPolicy, type CardCheckoutProvider } from '@/lib/billing/provider-choice';
import type { BillingProviderMode } from '@/lib/billing/saas-billing-config';
import { useWaitlistUi } from '@/components/waitlist/waitlist-context';

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
    provider: 'internal';
    price_id?: string;
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
  billingProviderMode,
  onCompleted,
}: {
  plans: PricingPlan[];
  trialDays: number;
  initialEntryState?: EntryState | null;
  billingProviderMode: BillingProviderMode;
  onCompleted: () => void;
}) {
  const { openWaitlist } = useWaitlistUi();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [entryState, setEntryState] = useState<EntryState | null>(initialEntryState ?? null);
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>(initialEntryState?.billing_interval ?? 'yearly');
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(
    initialEntryState?.pending_checkout_plan ?? initialEntryState?.selected_plan ?? null
  );
  const pricingLoadingActionRef = useRef<PlanPricingCtaAction | null>(null);
  const [loadingAction, setLoadingAction] = useState<PlanPricingCtaAction | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inlineCheckoutWaitlist, setInlineCheckoutWaitlist] = useState<CheckoutWaitlistPayload | null>(null);
  const [awaitingHostedCheckout, setAwaitingHostedCheckout] = useState(false);
  const [providerChoiceOpen, setProviderChoiceOpen] = useState(false);
  const [providerChoiceLoading, setProviderChoiceLoading] = useState(false);
  const [providerChoiceError, setProviderChoiceError] = useState<string | null>(null);
  const [providerChoiceWaitlist, setProviderChoiceWaitlist] = useState<CheckoutWaitlistPayload | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<CardCheckoutProvider>('flutterwave');
  const [pendingPaidPlan, setPendingPaidPlan] = useState<BillingPlan | null>(null);
  const confirmingRef = useRef(false);
  const anyLoading = loadingAction !== null;
  const secondaryLabel = pricingCardSecondaryTrialCtaLabel(trialDays);
  const showCheckoutOverlay = useCheckoutRedirectOverlay(awaitingHostedCheckout);
  const providerPolicy = cardCheckoutProviderPolicy(billingProviderMode);

  const beginPricingAction = useCallback((id: PlanPricingCtaAction) => {
    if (pricingLoadingActionRef.current != null) return false;
    pricingLoadingActionRef.current = id;
    setLoadingAction(id);
    return true;
  }, []);

  const clearPricingAction = useCallback(() => {
    pricingLoadingActionRef.current = null;
    setLoadingAction(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/onboarding-entry-state');
      const data = (await res.json().catch(() => null)) as EntryState | null;
      if (cancelled || !res.ok || !data) return;
      setEntryState(data);
      setBillingInterval(data.billing_interval ?? 'yearly');
      setSelectedPlan(data.pending_checkout_plan ?? data.selected_plan ?? null);
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

  useEffect(() => {
    let cancelled = false;
    const key = 'zenzex_waitlist_no_checkout_opened';
    void fetch('/api/billing/checkout-availability')
      .then((r) => r.json() as Promise<{ available?: boolean }>)
      .then((j) => {
        if (cancelled || j.available !== false) return;
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, '1');
        openWaitlist({ triggerReason: 'no_payment_provider', source: 'pricing' });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [openWaitlist]);

  const processedPaymentReturn = useRef<string | null>(null);

  /** After Flutterwave / Paystack redirect, complete subscription via verify endpoint. */
  useEffect(() => {
    const tx = searchParams.get('transaction_id');
    const ref = searchParams.get('trxref') || searchParams.get('reference');
    if (!tx && !ref) return;
    const dedupe = tx ? `fw:${tx}` : `ps:${ref}`;
    if (processedPaymentReturn.current === dedupe) return;
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    processedPaymentReturn.current = dedupe;
    setStatusText('Confirming payment…');
    setError(null);
    (async () => {
      try {
        const q = tx
          ? `provider=flutterwave&transaction_id=${encodeURIComponent(tx)}`
          : `provider=paystack&reference=${encodeURIComponent(ref!)}`;
        const res = await fetch(`/api/billing/verify?${q}`);
        if (res.ok) {
          const resState = await fetch('/api/onboarding-entry-state');
          const data = (await resState.json().catch(() => null)) as EntryState | null;
          if (data) {
            setEntryState(data);
            setSelectedPlan(data.pending_checkout_plan ?? data.selected_plan ?? null);
            if (data.onboarding_ready) {
              onCompleted();
              return;
            }
            setStatusText('Your plan is active. Continue to workspace setup…');
          }
        } else {
          setError('We could not confirm that payment yet. If you were charged, wait a moment and refresh, or contact support.');
          setStatusText('Your plan is selected. Finish checkout to continue.');
        }
      } catch {
        setError('Could not confirm payment. Try again in a moment.');
      } finally {
        confirmingRef.current = false;
        const clean = new URLSearchParams(searchParams.toString());
        clean.delete('transaction_id');
        clean.delete('trxref');
        clean.delete('reference');
        clean.delete('status');
        const nextQ = clean.toString();
        router.replace(nextQ ? `${pathname}?${nextQ}` : pathname, { scroll: false });
      }
    })();
  }, [searchParams, pathname, router, onCompleted]);

  async function runHostedCheckout(plan: BillingPlan, checkoutTimings?: BillingCheckoutClientTimings, selectedProviderArg?: CardCheckoutProvider) {
    setAwaitingHostedCheckout(true);
    try {
      const r = await requestBillingCheckout({
        plan,
        billingInterval,
        selectedProvider: selectedProviderArg,
        returnPath: '/onboarding',
        timings: checkoutTimings,
      });
      if (!r.ok) {
        const msg =
          typeof r.error === 'string'
            ? r.error
            : 'Checkout could not be started. Please choose another option or try again.';
        const wl = !r.ok && 'waitlist' in r ? r.waitlist : undefined;
        if (providerChoiceOpen) {
          setProviderChoiceError(msg);
          setProviderChoiceWaitlist(wl ?? null);
        } else {
          setError(msg);
          setInlineCheckoutWaitlist(wl ?? null);
        }
        setStatusText('Your plan is selected. Finish checkout to continue.');
        return false;
      }
      await completeBillingCheckoutResponse(r, checkoutTimings);
      setStatusText('Your plan is selected. Finish checkout to continue.');
      return true;
    } finally {
      setAwaitingHostedCheckout(false);
    }
  }

  async function choosePlan(plan: BillingPlan, mode: 'free' | 'trial' | 'paid') {
    setSelectedPlan(plan);
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[pricing] checkout_started=${plan}`);
      console.info(`[pricing] selected_plan=${plan}`);
    }
    const clickTs = performance.now();
    if (billingCheckoutPerfEnabled()) {
      billingCheckoutPerfLog('client', 'click_received', { plan, mode });
    }
    const actionId: PlanPricingCtaAction =
      mode === 'trial' ? planPricingCtaTrialAction(plan)! : planPricingCtaUpgradeAction(plan);
    if (!beginPricingAction(actionId)) return;
    if (billingCheckoutPerfEnabled()) {
      billingCheckoutPerfLog('client', 'loading_state_set', {
        since_click_ms: Math.round(performance.now() - clickTs),
      });
    }
    const checkoutTimings: BillingCheckoutClientTimings | undefined =
      billingCheckoutPerfEnabled() && mode === 'paid' ? { clickTs } : undefined;
    setError(null);
    setInlineCheckoutWaitlist(null);
    setStatusText(null);
    let keepBusyForRedirect = false;
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
      setSelectedPlan(data.pending_checkout_plan ?? data.selected_plan ?? plan);
      if (data.onboarding_ready) {
        setStatusText('Redirecting to onboarding…');
        onCompleted();
        return;
      }

      if (mode !== 'paid') return;

      const cfg = data.checkout_config;
      if (!cfg || !cfg.plan_key) {
        setStatusText('Your plan is selected. Finish checkout to continue.');
        setError('Checkout could not be prepared. Please try again.');
        return;
      }

      if (cfg.provider === 'internal') {
        if (providerPolicy.requiresChoice && providerPolicy.recommendedProvider) {
          setSelectedProvider(providerPolicy.recommendedProvider);
          setPendingPaidPlan(cfg.plan_key);
          setProviderChoiceError(null);
          setProviderChoiceWaitlist(null);
          setProviderChoiceOpen(true);
          console.info('[billing] provider_choice_modal_opened');
          return;
        }
        keepBusyForRedirect = await runHostedCheckout(cfg.plan_key, checkoutTimings);
        return;
      }

      setStatusText('Your plan is selected. Finish checkout to continue.');
      setError('Checkout could not be prepared. Please try again.');
    } finally {
      if (!keepBusyForRedirect) clearPricingAction();
    }
  }

  function primaryModeForPlan(plan: BillingPlan): 'free' | 'paid' {
    return plan === 'starter' ? 'free' : 'paid';
  }

  return (
    <div className="space-y-8">
      <CheckoutRedirectSubtleOverlay open={showCheckoutOverlay} />
      <CardProviderChoiceModal
        open={providerChoiceOpen}
        loading={providerChoiceLoading}
        selectedProvider={selectedProvider}
        recommendedProvider={providerPolicy.recommendedProvider ?? 'flutterwave'}
        errorMessage={providerChoiceError}
        showJoinWaitlist={Boolean(providerChoiceError && providerChoiceWaitlist)}
        onJoinWaitlist={
          providerChoiceWaitlist
            ? () =>
                openWaitlist({
                  triggerReason: providerChoiceWaitlist.trigger_reason,
                  source: 'pricing',
                })
            : undefined
        }
        onClose={() => {
          if (providerChoiceLoading) return;
          setProviderChoiceOpen(false);
          setProviderChoiceError(null);
          setProviderChoiceWaitlist(null);
          clearPricingAction();
        }}
        onSelect={(provider) => {
          setSelectedProvider(provider);
          setProviderChoiceError(null);
          setProviderChoiceWaitlist(null);
          console.info(`[billing] selected_provider=${provider}`);
        }}
        onContinue={() => {
          const plan = pendingPaidPlan;
          if (!plan || providerChoiceLoading) return;
          setProviderChoiceLoading(true);
          setProviderChoiceError(null);
          setProviderChoiceWaitlist(null);
          console.info(`[billing] checkout_provider_selected=${selectedProvider}`);
          const checkoutTimings: BillingCheckoutClientTimings | undefined = billingCheckoutPerfEnabled()
            ? { clickTs: performance.now() }
            : undefined;
          void runHostedCheckout(plan, checkoutTimings, selectedProvider)
            .then((ok) => {
              if (ok) return;
              setProviderChoiceLoading(false);
            })
            .catch(() => {
              setProviderChoiceError("Payment isn't available for your region yet.");
              setProviderChoiceWaitlist({ trigger_reason: 'provider_failed', source: 'payment_error' });
              setProviderChoiceLoading(false);
            });
        }}
      />
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
          className="space-y-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          <p>{error}</p>
          {inlineCheckoutWaitlist ? (
            <button
              type="button"
              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-950/50 dark:text-indigo-100"
              onClick={() =>
                openWaitlist({
                  triggerReason: inlineCheckoutWaitlist.trigger_reason,
                  source: 'pricing',
                })
              }
            >
              Join waitlist
            </button>
          ) : null}
        </div>
      ) : null}

      <PricingPlanCards
        plans={plans}
        billingInterval={billingInterval}
        currentPlanId={selectedPlan}
        selectedPlanId={selectedPlan}
        onPlanClick={(plan) => {
          setSelectedPlan(plan);
          if (process.env.NODE_ENV !== 'production') {
            console.info(`[pricing] card_selected=${plan}`);
            console.info(`[pricing] selected_plan=${plan}`);
          }
        }}
        renderDualCta={(plan: PricingPlan) => {
          const primaryActionId = planPricingCtaUpgradeAction(plan.id);
          const trialActionId = planPricingCtaTrialAction(plan.id);
          const primaryBusy = loadingAction === primaryActionId;
          const trialBusy = trialActionId != null && loadingAction === trialActionId;
          const primaryLoadingLabel =
            plan.id === 'starter' ? 'Updating plan…' : 'Preparing checkout…';
          return {
            primary: (
              <button
                type="button"
                disabled={anyLoading}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedPlan(plan.id);
                  void choosePlan(plan.id, primaryModeForPlan(plan.id));
                }}
                className="app-btn-primary inline-flex w-full items-center justify-center py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {primaryBusy ? primaryLoadingLabel : pricingCardPrimaryCtaLabel(plan.id)}
              </button>
            ),
            secondary:
              plan.showTrialCTA === true && plan.id !== 'starter' ? (
                <button
                  type="button"
                  disabled={anyLoading}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedPlan(plan.id);
                    void choosePlan(plan.id, 'trial');
                  }}
                  className={`${pricingCardSecondaryCtaClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {trialBusy ? 'Starting trial…' : secondaryLabel}
                </button>
              ) : null,
          };
        }}
      />
    </div>
  );
}
