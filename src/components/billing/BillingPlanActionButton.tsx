'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { catalogPriceIdForPlanInterval } from '@/lib/billing/catalog-price-map';
import { getPricingPlan, type BillingPlan, type PlanBillingInterval } from '@/lib/billing/plans';
import { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';

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
  /** Fires when this button starts/finishes a network action (for dual-CTA rows sharing busy state). */
  onBusyPlanChange,
  /** When set, all pricing-card actions are disabled; this row shows Saving when it matches. */
  busyRowPlan,
  billingInterval,
}: {
  targetPlan: BillingPlan;
  cta: string;
  disabled: boolean;
  popular: boolean;
  /** When true (lapsed subscription), start Paddle checkout instead of PATCH plan. */
  requiresPayment?: boolean;
  embeddedInPricingCard?: boolean;
  trialSecondaryStyle?: boolean;
  onBusyPlanChange?: (plan: BillingPlan | null) => void;
  busyRowPlan?: BillingPlan | null;
  billingInterval?: PlanBillingInterval;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV !== 'production';
  const pricing = getPricingPlan(targetPlan);
  const chosenInterval = billingInterval ?? 'yearly';
  const resolvedPriceId = pricing.isFree ? null : catalogPriceIdForPlanInterval(targetPlan, chosenInterval);

  async function onClick() {
    if (disabled || loading || busyRowPlan != null) return;
    setErrorMessage(null);
    if (isDev) {
      console.info('[PricingCTA][Billing]', {
        route: typeof window !== 'undefined' ? window.location.pathname : '/dashboard/billing',
        auth: 'authenticated',
        plan: targetPlan,
        billingCycle: chosenInterval,
        priceId: resolvedPriceId,
        paddleInitialized: typeof window !== 'undefined' && Boolean(window.Paddle),
      });
    }
    setLoading(true);
    onBusyPlanChange?.(targetPlan);
    try {
      if (!pricing.isFree) {
        const res = await fetch('/api/billing/checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: targetPlan, billing_interval: chosenInterval }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
        if (!res.ok || !j.url) {
          const msg = typeof j.error === 'string' ? j.error : 'Could not start checkout.';
          setErrorMessage(msg);
          if (isDev) console.error('[PricingCTA][Billing] checkout-session failed', { plan: targetPlan, chosenInterval, msg });
          return;
        }
        window.location.assign(j.url);
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
      setLoading(false);
      onBusyPlanChange?.(null);
    }
  }

  const globalBusy = busyRowPlan != null;
  const rowShowsSaving = loading || busyRowPlan === targetPlan;
  const inactive = disabled || globalBusy || loading;

  if (trialSecondaryStyle) {
    return (
      <>
        <button
          type="button"
          disabled={inactive}
          onClick={onClick}
          className={cn(
            pricingCardSecondaryCtaClassName,
            inactive && 'cursor-not-allowed opacity-60',
            !inactive && 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
          )}
        >
          {rowShowsSaving ? 'Saving…' : cta}
        </button>
        {errorMessage ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="status">
            {errorMessage}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={inactive}
        onClick={onClick}
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
        {rowShowsSaving ? 'Saving…' : cta}
      </button>
      {errorMessage ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="status">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
