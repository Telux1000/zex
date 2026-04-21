'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { getPaddleEnvironment, openPaddleCheckout } from '@/lib/paddle/paddle-browser';

export function SubscribeButton({
  priceId,
  label,
  className,
  disabled,
  billingCycle,
}: {
  priceId: string;
  label: string;
  className?: string;
  disabled?: boolean;
  billingCycle?: 'monthly' | 'yearly';
}) {
  const [loading, setLoading] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV !== 'production';

  async function onClick() {
    const trimmedPriceId = priceId.trim();
    if (loading || disabled || !trimmedPriceId) {
      if (isDev && !trimmedPriceId) {
        setDebugMessage('Checkout blocked: missing priceId for selected plan/interval.');
      }
      return;
    }
    if (isDev) {
      console.info('[Paddle][SubscribeButton] click', {
        billingCycle: billingCycle ?? 'unknown',
        priceId: trimmedPriceId,
        environment: getPaddleEnvironment(),
        paddleInitialized: typeof window !== 'undefined' && Boolean(window.Paddle),
      });
      setDebugMessage(null);
    }
    setLoading(true);
    try {
      await openPaddleCheckout(trimmedPriceId);
    } catch (error) {
      if (isDev) {
        const msg = error instanceof Error ? error.message : 'Unknown Paddle checkout error.';
        setDebugMessage(`Checkout failed: ${msg}`);
      }
      // ensurePaddleReady / openPaddleCheckout already logs detailed errors
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={onClick}
        className={cn(
          'inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        {loading ? 'Opening…' : label}
      </button>
      {isDev && debugMessage ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" role="status">
          {debugMessage}
        </p>
      ) : null}
    </>
  );
}
