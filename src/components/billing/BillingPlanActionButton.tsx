'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { getPricingPlan, type BillingPlan, type PlanBillingInterval } from '@/lib/billing/plans';
import {
  completeBillingCheckoutResponse,
  requestBillingCheckout,
  type BillingCheckoutClientTimings,
  type CheckoutWaitlistPayload,
} from '@/lib/billing/client-checkout';
import { billingCheckoutPerfEnabled, billingCheckoutPerfLog } from '@/lib/billing/billing-checkout-perf';
import { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';
import type { PlanPricingCtaAction } from '@/lib/billing/pricing-cta-action';
import {
  CheckoutRedirectSubtleOverlay,
  useCheckoutRedirectOverlay,
} from '@/components/billing/CheckoutRedirectSubtleOverlay';
import { CardProviderChoiceModal } from '@/components/billing/CardProviderChoiceModal';
import { cardCheckoutProviderPolicy, type CardCheckoutProvider } from '@/lib/billing/provider-choice';
import type { BillingProviderMode } from '@/lib/billing/saas-billing-config';
import { useWaitlistUi } from '@/components/waitlist/waitlist-context';

export function BillingPlanActionButton({
  targetPlan,
  cta,
  disabled,
  popular,
  requiresPayment,
  /** When true, omit top margin (use inside shared pricing card dual-CTA stack). */
  embeddedInPricingCard,
  /** Lighter second action under the main CTA on pricing cards (same behavior as primary). */
  trialSecondaryStyle,
  /** Stable id for this CTA (e.g. growth_upgrade vs growth_trial). */
  ctaActionId,
  /** Parent-held busy action; null when no checkout / plan change is in flight. */
  loadingAction,
  /** Returns false if another CTA already started (sync guard). */
  beginAction,
  /** Clears parent busy state unless redirect is in progress (caller passes skip). */
  clearAction,
  billingInterval,
  customerEmail,
  /** Force non-checkout internal plan/trial action for trial CTA paths. */
  preferInternalTrialAction,
  billingProviderMode,
}: {
  targetPlan: BillingPlan;
  cta: string;
  disabled: boolean;
  popular: boolean;
  /** When true (lapsed subscription), start billing checkout instead of PATCH plan. */
  requiresPayment?: boolean;
  embeddedInPricingCard?: boolean;
  trialSecondaryStyle?: boolean;
  ctaActionId: PlanPricingCtaAction;
  loadingAction: PlanPricingCtaAction | null;
  beginAction: (id: PlanPricingCtaAction) => boolean;
  clearAction: () => void;
  billingInterval?: PlanBillingInterval;
  customerEmail?: string | null;
  /** Force non-checkout internal plan/trial action for trial CTA paths. */
  preferInternalTrialAction?: boolean;
  billingProviderMode?: BillingProviderMode;
}) {
  const router = useRouter();
  const { openWaitlist } = useWaitlistUi();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inlineWaitlist, setInlineWaitlist] = useState<CheckoutWaitlistPayload | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceLoading, setChoiceLoading] = useState(false);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [choiceWaitlist, setChoiceWaitlist] = useState<CheckoutWaitlistPayload | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<CardCheckoutProvider>('flutterwave');
  const isDev = process.env.NODE_ENV !== 'production';
  const pricing = getPricingPlan(targetPlan);
  const chosenInterval = billingInterval ?? 'yearly';

  const anyCtaBusy = loadingAction !== null;
  const isThisLoading = loadingAction === ctaActionId;
  const inactive = disabled || anyCtaBusy;
  const checkoutOverlayActive =
    isThisLoading && !preferInternalTrialAction && !pricing.isFree;
  const showCheckoutOverlay = useCheckoutRedirectOverlay(checkoutOverlayActive);
  const providerPolicy = billingProviderMode
    ? cardCheckoutProviderPolicy(billingProviderMode)
    : { requiresChoice: false, recommendedProvider: null, allowedProviders: [] as CardCheckoutProvider[] };

  async function startHostedCheckout(selected?: CardCheckoutProvider): Promise<boolean> {
    const clickTs = performance.now();
    const checkoutTimings: BillingCheckoutClientTimings | undefined =
      billingCheckoutPerfEnabled() ? { clickTs } : undefined;
    const r = await requestBillingCheckout({
      plan: targetPlan,
      billingInterval: chosenInterval,
      selectedProvider: selected,
      returnPath: '/dashboard/billing',
      timings: checkoutTimings,
    });
    if (r.ok) {
      await completeBillingCheckoutResponse(r, checkoutTimings);
      return true;
    }
    const msg =
      typeof r.error === 'string' ? r.error : 'Checkout could not be started. Please choose another option or try again.';
    const wl = !r.ok && 'waitlist' in r ? r.waitlist : undefined;
    if (choiceOpen) {
      setChoiceError(msg);
      setChoiceWaitlist(wl ?? null);
    } else {
      setErrorMessage(msg);
      setInlineWaitlist(wl ?? null);
    }
    return false;
  }

  function loadingButtonLabel(): string {
    if (preferInternalTrialAction) return 'Starting trial…';
    if (!pricing.isFree) return 'Preparing checkout…';
    return 'Updating plan…';
  }

  async function onClick() {
    if (disabled) return;
    const clickTs = performance.now();
    if (billingCheckoutPerfEnabled()) {
      billingCheckoutPerfLog('client', 'click_received', { plan: targetPlan });
    }
    if (!beginAction(ctaActionId)) return;
    if (billingCheckoutPerfEnabled()) {
      billingCheckoutPerfLog('client', 'loading_state_set', {
        since_click_ms: Math.round(performance.now() - clickTs),
      });
    }
    setErrorMessage(null);
    setInlineWaitlist(null);
    let keepBusyForRedirect = false;
    if (isDev) {
      console.info('[PricingCTA][Billing]', {
        route: typeof window !== 'undefined' ? window.location.pathname : '/dashboard/billing',
        auth: 'authenticated',
        plan: targetPlan,
        billingCycle: chosenInterval,
        action:
          pricing.isFree || preferInternalTrialAction
            ? 'update_internal_plan'
            : 'billing_checkout',
        customerEmail: customerEmail ?? null,
      });
    }
    try {
      if (!pricing.isFree && !preferInternalTrialAction) {
        if (providerPolicy.requiresChoice && providerPolicy.recommendedProvider) {
          setSelectedProvider(providerPolicy.recommendedProvider);
          setChoiceError(null);
          setChoiceWaitlist(null);
          setChoiceOpen(true);
          console.info('[billing] provider_choice_modal_opened');
          return;
        }
        const started = await startHostedCheckout(undefined);
        if (started) keepBusyForRedirect = true;
        return;
      }

      const res = await fetch('/api/billing/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg = typeof j.error === 'string' ? j.error : 'Could not update plan.';
        setErrorMessage(msg);
        return;
      }
      router.refresh();
    } finally {
      if (!keepBusyForRedirect) clearAction();
    }
  }

  if (trialSecondaryStyle) {
    return (
      <>
        <CheckoutRedirectSubtleOverlay open={showCheckoutOverlay} />
        <button
          type="button"
          disabled={inactive}
          onClick={(event) => {
            event.stopPropagation();
            void onClick();
          }}
          className={cn(
            pricingCardSecondaryCtaClassName,
            inactive && 'cursor-not-allowed opacity-60',
            !inactive && 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
          )}
        >
          {isThisLoading ? loadingButtonLabel() : cta}
        </button>
        {errorMessage ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-red-600 dark:text-red-400" role="status">
              {errorMessage}
            </p>
            {inlineWaitlist ? (
              <button
                type="button"
                className="w-full rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-100"
                onClick={() =>
                  openWaitlist({ triggerReason: inlineWaitlist.trigger_reason, source: inlineWaitlist.source })
                }
              >
                Join waitlist
              </button>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <CheckoutRedirectSubtleOverlay open={showCheckoutOverlay} />
      <CardProviderChoiceModal
        open={choiceOpen}
        loading={choiceLoading}
        selectedProvider={selectedProvider}
        recommendedProvider={providerPolicy.recommendedProvider ?? 'flutterwave'}
        errorMessage={choiceError}
        showJoinWaitlist={Boolean(choiceError && choiceWaitlist)}
        onJoinWaitlist={
          choiceWaitlist
            ? () =>
                openWaitlist({
                  triggerReason: choiceWaitlist.trigger_reason,
                  source: choiceWaitlist.source,
                })
            : undefined
        }
        onClose={() => {
          if (choiceLoading) return;
          setChoiceOpen(false);
          setChoiceError(null);
          setChoiceWaitlist(null);
          clearAction();
        }}
        onSelect={(provider) => {
          setSelectedProvider(provider);
          setChoiceError(null);
          setChoiceWaitlist(null);
          console.info(`[billing] selected_provider=${provider}`);
        }}
        onContinue={() => {
          if (choiceLoading) return;
          setChoiceLoading(true);
          setChoiceError(null);
          setChoiceWaitlist(null);
          console.info(`[billing] checkout_provider_selected=${selectedProvider}`);
          void startHostedCheckout(selectedProvider)
            .then((ok) => {
              if (ok) return;
              setChoiceLoading(false);
            })
            .catch(() => {
              setChoiceError("Payment isn't available for your region yet.");
              setChoiceWaitlist({ trigger_reason: 'provider_failed', source: 'payment_error' });
              setChoiceLoading(false);
            });
        }}
      />
      <button
        type="button"
        disabled={inactive}
        onClick={(event) => {
          event.stopPropagation();
          void onClick();
        }}
        className={cn(
          'inline-flex w-full items-center justify-center py-2.5 text-center text-sm font-semibold',
          !embeddedInPricingCard && 'mt-8',
          inactive
            ? 'cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
            : embeddedInPricingCard || popular
              ? 'app-btn-primary'
              : 'app-btn-secondary'
        )}
      >
        {isThisLoading ? loadingButtonLabel() : cta}
      </button>
      {errorMessage ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-red-600 dark:text-red-400" role="status">
            {errorMessage}
          </p>
          {inlineWaitlist ? (
            <button
              type="button"
              className="w-full rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-100"
              onClick={() =>
                openWaitlist({ triggerReason: inlineWaitlist.trigger_reason, source: inlineWaitlist.source })
              }
            >
              Join waitlist
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
