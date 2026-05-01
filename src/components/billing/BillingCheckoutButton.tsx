'use client';

import { useState } from 'react';
import { getPricingPlan, type BillingPlan, type PlanBillingInterval } from '@/lib/billing/plans';
import {
  completeBillingCheckoutResponse,
  requestBillingCheckout,
  type BillingCheckoutClientTimings,
  type CheckoutWaitlistPayload,
} from '@/lib/billing/client-checkout';
import { billingCheckoutPerfEnabled, billingCheckoutPerfLog } from '@/lib/billing/billing-checkout-perf';
import { cn } from '@/lib/utils/cn';
import {
  CheckoutRedirectSubtleOverlay,
  useCheckoutRedirectOverlay,
} from '@/components/billing/CheckoutRedirectSubtleOverlay';
import { CardProviderChoiceModal } from '@/components/billing/CardProviderChoiceModal';
import { cardCheckoutProviderPolicy, type CardCheckoutProvider } from '@/lib/billing/provider-choice';
import type { BillingProviderMode } from '@/lib/billing/saas-billing-config';
import { useWaitlistUi } from '@/components/waitlist/waitlist-context';

/** Internal billing (Flutterwave / Paystack redirect). Owner-only; parent should gate visibility. */
export function BillingCheckoutButton({
  plan,
  billingInterval,
  customerEmail: _customerEmail,
  className,
  children,
  billingProviderMode,
}: {
  plan: BillingPlan;
  billingInterval?: PlanBillingInterval;
  customerEmail?: string | null;
  className?: string;
  children: React.ReactNode;
  billingProviderMode?: BillingProviderMode;
}) {
  const { openWaitlist } = useWaitlistUi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutWaitlist, setCheckoutWaitlist] = useState<CheckoutWaitlistPayload | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceLoading, setChoiceLoading] = useState(false);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [choiceWaitlist, setChoiceWaitlist] = useState<CheckoutWaitlistPayload | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<CardCheckoutProvider>('flutterwave');
  const isDev = process.env.NODE_ENV !== 'production';
  const pricing = getPricingPlan(plan);
  const chosenInterval = billingInterval ?? 'yearly';
  const showCheckoutOverlay = useCheckoutRedirectOverlay(loading);
  const providerPolicy = billingProviderMode
    ? cardCheckoutProviderPolicy(billingProviderMode)
    : { requiresChoice: false, recommendedProvider: null, allowedProviders: [] as CardCheckoutProvider[] };

  function openWaitlistFromPayload(w: CheckoutWaitlistPayload) {
    openWaitlist({ triggerReason: w.trigger_reason, source: w.source });
  }

  async function beginCheckout(selected?: CardCheckoutProvider): Promise<boolean> {
    const timings: BillingCheckoutClientTimings | undefined = billingCheckoutPerfEnabled()
      ? { clickTs: performance.now() }
      : undefined;
    const r = await requestBillingCheckout({
      plan,
      billingInterval: chosenInterval,
      selectedProvider: selected,
      returnPath: '/dashboard/billing',
      timings,
    });
    if (r.ok) {
      await completeBillingCheckoutResponse(r, timings);
      return true;
    }
    const msg = typeof r.error === 'string' ? r.error : 'Checkout could not be started. Please try again.';
    const wl = !r.ok && 'waitlist' in r ? r.waitlist : undefined;
    if (choiceOpen) {
      setChoiceError(msg);
      setChoiceWaitlist(wl ?? null);
    } else {
      setError(msg);
      setCheckoutWaitlist(wl ?? null);
    }
    return false;
  }

  async function onClick() {
    if (loading) return;
    const clickTs = performance.now();
    if (billingCheckoutPerfEnabled()) {
      billingCheckoutPerfLog('client', 'click_received', { plan });
    }
    setError(null);
    setCheckoutWaitlist(null);
    if (isDev) {
      console.info('[PricingCTA][BillingCheckoutButton] open', {
        route: typeof window !== 'undefined' ? window.location.pathname : '/dashboard/billing',
        plan,
        billingCycle: chosenInterval,
        action: 'billing_checkout',
      });
    }
    setLoading(true);
    if (billingCheckoutPerfEnabled()) {
      billingCheckoutPerfLog('client', 'loading_state_set', {
        since_click_ms: Math.round(performance.now() - clickTs),
      });
    }
    let skipClear = false;
    try {
      if (providerPolicy.requiresChoice && providerPolicy.recommendedProvider) {
        setSelectedProvider(providerPolicy.recommendedProvider);
        setChoiceError(null);
        setChoiceWaitlist(null);
        setChoiceOpen(true);
        console.info('[billing] provider_choice_modal_opened');
        return;
      }
      const ok = await beginCheckout(undefined);
      if (ok) {
        skipClear = true;
        return;
      }
    } finally {
      if (!skipClear) setLoading(false);
    }
  }

  if (pricing.isFree) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The Starter plan does not require a payment method. Add a card when you upgrade to a paid plan.
      </p>
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
            ? () => {
                openWaitlistFromPayload(choiceWaitlist);
              }
            : undefined
        }
        onClose={() => {
          if (choiceLoading) return;
          setChoiceOpen(false);
          setChoiceError(null);
          setChoiceWaitlist(null);
          setLoading(false);
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
          void beginCheckout(selectedProvider)
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
        disabled={loading}
        onClick={onClick}
        className={cn(
          'inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        {loading ? 'Preparing checkout…' : children}
      </button>
      {error ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-red-600 dark:text-red-400" role="status">
            {error}
          </p>
          {checkoutWaitlist ? (
            <button
              type="button"
              className="w-full rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-900/50"
              onClick={() => openWaitlistFromPayload(checkoutWaitlist)}
            >
              Join waitlist
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
