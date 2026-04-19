'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { getPricingPlan, type BillingPlan } from '@/lib/billing/plans';
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
}: {
  targetPlan: BillingPlan;
  cta: string;
  disabled: boolean;
  popular: boolean;
  /** When true (lapsed subscription), start Stripe Checkout instead of PATCH plan. */
  requiresPayment?: boolean;
  embeddedInPricingCard?: boolean;
  trialSecondaryStyle?: boolean;
  onBusyPlanChange?: (plan: BillingPlan | null) => void;
  busyRowPlan?: BillingPlan | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const pricing = getPricingPlan(targetPlan);
  const priceConfigured = pricing.isFree || Boolean(pricing.catalogPriceId?.trim());
  const payBlocked = requiresPayment && !priceConfigured;

  async function onClick() {
    if (disabled || loading || payBlocked || busyRowPlan != null) return;
    setLoading(true);
    onBusyPlanChange?.(targetPlan);
    try {
      if (requiresPayment) {
        const res = await fetch('/api/billing/checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: targetPlan }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
        if (!res.ok || !j.url) {
          window.alert(typeof j.error === 'string' ? j.error : 'Could not start checkout.');
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
        window.alert(typeof j.error === 'string' ? j.error : 'Could not update plan.');
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
  const inactive = disabled || payBlocked || globalBusy || loading;

  if (trialSecondaryStyle) {
    return (
      <button
        type="button"
        disabled={inactive}
        title={payBlocked ? 'This plan needs a Stripe price ID in environment configuration.' : undefined}
        onClick={onClick}
        className={cn(
          pricingCardSecondaryCtaClassName,
          inactive && 'cursor-not-allowed opacity-60',
          !inactive && 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
        )}
      >
        {rowShowsSaving ? 'Saving…' : cta}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={inactive}
      title={payBlocked ? 'This plan needs a Stripe price ID in environment configuration.' : undefined}
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
  );
}
