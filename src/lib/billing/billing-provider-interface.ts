import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingPlan, PlanBillingInterval } from '@/lib/billing/plans';
import type { CreateCheckoutResult, SaasProviderId, CheckoutContext } from '@/lib/billing/billing-types';

export type BillingProviderName = 'flutterwave' | 'paystack' | 'stripe';

/**
 * Pluggable processor behind `billing-service`.
 * Add Stripe by implementing this interface + env-backed plan price IDs.
 */
export type BillingProviderModule = {
  id: SaasProviderId | BillingProviderName;
  isConfigured: () => boolean;
  createCheckout: (
    admin: SupabaseClient,
    ctx: CheckoutContext,
    subscriptionId: string
  ) => Promise<CreateCheckoutResult>;
  /** True when the HTTP webhook signature matches (secret never logged). */
  verifyWebhookRequest: (args: { rawBody: string; headers: Headers }) => boolean;
  /** After verification, normalize + apply (idempotent). */
  handleVerifiedWebhook: (
    admin: SupabaseClient,
    args: { rawBody: string; parsed: unknown; headers: Headers }
  ) => Promise<{ received: true; duplicate?: boolean }>;
};

export type CreateCheckoutRequest = {
  plan: BillingPlan;
  interval: PlanBillingInterval;
};

/**
 * Opaque “verify payment” for return URLs (best-effort; webhooks are authoritative).
 */
export type VerifyPaymentRequest =
  | { provider: 'flutterwave'; transactionId: number }
  | { provider: 'paystack'; reference: string };

export function isRedirectCheckout(r: CreateCheckoutResult): r is CreateCheckoutResult & { kind: 'redirect' } {
  return r.kind === 'redirect';
}
