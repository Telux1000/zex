'use client';

import { cn } from '@/lib/utils/cn';
import type { PlanBillingInterval } from '@/lib/billing/plans';

export function BillingIntervalToggle({
  value,
  onChange,
  className,
}: {
  value: PlanBillingInterval;
  onChange: (v: PlanBillingInterval) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-0.5 shadow-sm',
        className
      )}
      role="group"
      aria-label="Billing interval"
    >
      {(['monthly', 'yearly'] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
            value === key
              ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          )}
        >
          {key === 'monthly' ? 'Monthly' : 'Yearly'}
        </button>
      ))}
    </div>
  );
}
