import type { SaasProviderId } from '@/lib/billing/billing-types';

/**
 * Future: implement `createCheckoutSession` with Stripe Billing (price IDs from env),
 * webhooks via `stripe` package, and map into `applyVerifiedSuccessfulCharge`.
 */
export const STRIPE_SAAS_NOT_IMPLEMENTED = 'stripe_saas_not_implemented' as const;
export const STRIPE_SAAS_NOT_CONFIGURED = 'Stripe billing provider is not configured.' as const;

export function assertStripeSaaSNotUsed(id: SaasProviderId): void {
  if (id === 'stripe') {
    throw new Error(STRIPE_SAAS_NOT_IMPLEMENTED);
  }
}

export async function createStripeCheckoutPlaceholder(): Promise<never> {
  throw new Error(STRIPE_SAAS_NOT_CONFIGURED);
}
