import Link from 'next/link';
import type { SubscriptionLifecycleStatus } from '@/lib/billing/subscription-access';
import { subscriptionLapsedMessage } from '@/lib/billing/subscription-access';

export function DashboardSubscriptionBanner({
  effective,
  urgency,
}: {
  effective: SubscriptionLifecycleStatus;
  /** 7 | 3 | 1 when trial is in final week / 3 days / last day */
  urgency: 7 | 3 | 1 | null;
}) {
  if (effective === 'trial_expired' || effective === 'past_due' || effective === 'cancelled') {
    return (
      <div className="mx-auto mb-4 max-w-[1200px] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          {subscriptionLapsedMessage(effective)}
        </p>
        <Link
          href="/dashboard/billing"
          className="mt-2 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          View plans & billing
        </Link>
      </div>
    );
  }

  if (effective === 'trialing' && urgency != null) {
    const label = urgency === 1 ? '1 day' : `${urgency} days`;
    return (
      <div className="mx-auto mb-4 max-w-[1200px] rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-950/40">
        <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
          {label} left in your free trial. Choose a plan to keep creating and sending invoices.
        </p>
        <Link
          href="/dashboard/billing"
          className="mt-2 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          Billing & Payments
        </Link>
      </div>
    );
  }

  return null;
}
