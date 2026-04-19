'use client';

import { useState } from 'react';
import { getPricingPlan, type BillingPlan } from '@/lib/billing/plans';
import { cn } from '@/lib/utils/cn';

/** Opens Paddle Checkout for the given plan (subscription). Owner-only; parent should gate visibility. */
export function BillingCheckoutButton({
  plan,
  className,
  children,
}: {
  plan: BillingPlan;
  className?: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const pricing = getPricingPlan(plan);
  const priceConfigured = !pricing.isFree && Boolean(pricing.catalogPriceId?.trim());

  async function onClick() {
    if (loading || !priceConfigured) return;
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !j.url) {
        window.alert(typeof j.error === 'string' ? j.error : 'Could not start checkout.');
        return;
      }
      window.location.assign(j.url);
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
    <button
      type="button"
      disabled={loading || !priceConfigured}
      title={
        !priceConfigured
          ? 'Set NEXT_PUBLIC_PADDLE_PRICE_* for this plan to enable checkout.'
          : undefined
      }
      onClick={onClick}
      className={cn(
        'inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {loading ? 'Redirecting…' : children}
    </button>
  );
}
