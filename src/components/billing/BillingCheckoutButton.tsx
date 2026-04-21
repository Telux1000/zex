'use client';

import { useState } from 'react';
import { catalogPriceIdForPlanInterval } from '@/lib/billing/catalog-price-map';
import { getPricingPlan, type BillingPlan, type PlanBillingInterval } from '@/lib/billing/plans';
import { openPaddleCheckout } from '@/lib/paddle/paddle-browser';
import { cn } from '@/lib/utils/cn';

/** Opens Paddle Checkout for the given plan (subscription). Owner-only; parent should gate visibility. */
export function BillingCheckoutButton({
  plan,
  billingInterval,
  customerEmail,
  className,
  children,
}: {
  plan: BillingPlan;
  billingInterval?: PlanBillingInterval;
  customerEmail?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV !== 'production';
  const pricing = getPricingPlan(plan);
  const chosenInterval = billingInterval ?? 'yearly';
  const resolvedPriceId = catalogPriceIdForPlanInterval(plan, chosenInterval);
  const priceConfigured = !pricing.isFree && Boolean(resolvedPriceId?.trim());

  async function onClick() {
    if (loading) return;
    setError(null);
    if (!priceConfigured || !resolvedPriceId) {
      setError(`Missing Paddle price ID for ${chosenInterval} billing on ${plan}.`);
      return;
    }
    if (isDev) {
      console.info('[PricingCTA][BillingCheckoutButton] open', {
        route: typeof window !== 'undefined' ? window.location.pathname : '/dashboard/billing',
        plan,
        billingCycle: chosenInterval,
        priceId: resolvedPriceId,
        customerEmail: customerEmail ?? null,
        paddleInitialized: typeof window !== 'undefined' && Boolean(window.Paddle),
      });
    }
    setLoading(true);
    try {
      await openPaddleCheckout(resolvedPriceId, customerEmail ?? undefined);
    } finally {
      setLoading(false);
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
      <button
        type="button"
        disabled={loading}
        onClick={onClick}
        className={cn(
          'inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        {loading ? 'Opening…' : children}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="status">
          {error}
        </p>
      ) : null}
    </>
  );
}
