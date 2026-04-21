'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { openPaddleCheckout } from '@/lib/paddle/paddle-browser';

export function SubscribeButton({
  priceId,
  label,
  className,
  disabled,
}: {
  priceId: string;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading || disabled || !priceId.trim()) return;
    setLoading(true);
    try {
      await openPaddleCheckout(priceId.trim());
    } catch {
      // ensurePaddleReady / openPaddleCheckout already log details to the console
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}
