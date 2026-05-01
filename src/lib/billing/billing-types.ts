import type { BillingPlan, PlanBillingInterval } from '@/lib/billing/plans';

export type SaasProviderId = 'flutterwave' | 'paystack' | 'stripe';

export type SaasInternalSubscriptionStatus =
  | 'pending_checkout'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type NormalizedBillingEvent =
  | 'checkout.completed'
  | 'subscription.active'
  | 'subscription.trialing'
  | 'subscription.renewed'
  | 'payment.failed'
  | 'subscription.past_due'
  | 'subscription.canceled'
  | 'subscription.expired'
  | 'unknown';

export type CheckoutContext = {
  userId: string;
  businessId: string | null;
  userEmail: string | null;
  plan: BillingPlan;
  interval: PlanBillingInterval;
  /** Public site URL for redirects (server-derived). */
  appBaseUrl: string;
  /** Post-payment redirect (path), e.g. /dashboard/billing */
  returnPath: string;
};

export type CreateCheckoutResult = {
  kind: 'redirect';
  provider: SaasProviderId;
  redirectUrl: string;
  internalSubscriptionId: string;
};

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingConfigurationError';
  }
}

export class BillingProviderError extends Error {
  constructor(
    message: string,
    readonly provider: SaasProviderId
  ) {
    super(message);
    this.name = 'BillingProviderError';
  }
}
