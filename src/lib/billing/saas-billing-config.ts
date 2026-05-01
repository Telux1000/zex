import type { SaasProviderId } from '@/lib/billing/billing-types';

export const BILLING_PROVIDER_MODES = [
  'flutterwave_only',
  'paystack_only',
  'stripe_only',
  'flutterwave_primary_paystack_fallback',
  'paystack_primary_flutterwave_fallback',
  'stripe_primary_flutterwave_fallback',
  'stripe_primary_paystack_fallback',
  'flutterwave_primary_stripe_fallback',
  'paystack_primary_stripe_fallback',
] as const;

export type BillingProviderMode = (typeof BILLING_PROVIDER_MODES)[number];

function trim(key: string | undefined): string | null {
  const v = key?.trim();
  return v && v.length > 0 ? v : null;
}

export function isFlutterwaveConfigured(): boolean {
  return Boolean(trim(process.env.FLUTTERWAVE_SECRET_KEY));
}

export function isPaystackConfigured(): boolean {
  return Boolean(trim(process.env.PAYSTACK_SECRET_KEY));
}

/** Stripe SaaS checkout is considered configured only when core webhook + secret keys exist. */
export function isStripeConfigured(): boolean {
  return Boolean(trim(process.env.STRIPE_SECRET_KEY) && trim(process.env.STRIPE_WEBHOOK_SECRET));
}

/** Alias kept for compatibility with older call sites. */
export function isStripeSaaSConfigured(): boolean {
  return isStripeConfigured();
}

/** When true, POST /api/plan-selection (paid) can start internal checkout. */
export function isInternalSaaSBillingConfigured(): boolean {
  return isFlutterwaveConfigured() || isPaystackConfigured() || isStripeConfigured();
}

/**
 * Reads `BILLING_SAAS_PRIMARY` on the server only (this module is server-side).
 * Trim + lowercase. Valid: `paystack` | `flutterwave`. Anything else → flutterwave.
 */
export function readSaasCheckoutPrimaryProviderEnv(): 'flutterwave' | 'paystack' {
  const raw = process.env.BILLING_SAAS_PRIMARY?.trim().toLowerCase() ?? '';
  return raw === 'paystack' ? 'paystack' : 'flutterwave';
}

const BOTH: SaasProviderId[] = ['flutterwave', 'paystack', 'stripe'];

export function billingProviderModeFromEnvPrimary(): BillingProviderMode {
  return readSaasCheckoutPrimaryProviderEnv() === 'paystack'
    ? 'paystack_primary_flutterwave_fallback'
    : 'flutterwave_primary_paystack_fallback';
}

export function normalizeBillingProviderMode(value: unknown): BillingProviderMode {
  if (typeof value !== 'string') return billingProviderModeFromEnvPrimary();
  const normalized = value.trim().toLowerCase();
  if (normalized === 'flutterwave_only') return 'flutterwave_only';
  if (normalized === 'paystack_only') return 'paystack_only';
  if (normalized === 'stripe_only') return 'stripe_only';
  if (normalized === 'paystack_primary_flutterwave_fallback') {
    return 'paystack_primary_flutterwave_fallback';
  }
  if (normalized === 'flutterwave_primary_paystack_fallback') {
    return 'flutterwave_primary_paystack_fallback';
  }
  if (normalized === 'stripe_primary_flutterwave_fallback') {
    return 'stripe_primary_flutterwave_fallback';
  }
  if (normalized === 'stripe_primary_paystack_fallback') {
    return 'stripe_primary_paystack_fallback';
  }
  if (normalized === 'flutterwave_primary_stripe_fallback') {
    return 'flutterwave_primary_stripe_fallback';
  }
  if (normalized === 'paystack_primary_stripe_fallback') {
    return 'paystack_primary_stripe_fallback';
  }
  return billingProviderModeFromEnvPrimary();
}

export function providerOrderForBillingMode(mode: BillingProviderMode): SaasProviderId[] {
  switch (mode) {
    case 'flutterwave_only':
      return ['flutterwave'];
    case 'paystack_only':
      return ['paystack'];
    case 'stripe_only':
      return ['stripe'];
    case 'paystack_primary_flutterwave_fallback':
      return ['paystack', 'flutterwave'];
    case 'stripe_primary_flutterwave_fallback':
      return ['stripe', 'flutterwave'];
    case 'stripe_primary_paystack_fallback':
      return ['stripe', 'paystack'];
    case 'flutterwave_primary_stripe_fallback':
      return ['flutterwave', 'stripe'];
    case 'paystack_primary_stripe_fallback':
      return ['paystack', 'stripe'];
    case 'flutterwave_primary_paystack_fallback':
    default:
      return ['flutterwave', 'paystack'];
  }
}

/**
 * Provider preference for non-checkout flows. Same primary env as hosted checkout.
 */
export function saasProviderPriorityOrder(): SaasProviderId[] {
  const primary = providerOrderForBillingMode(billingProviderModeFromEnvPrimary())[0] ?? 'flutterwave';
  return [primary, ...BOTH.filter((p) => p !== primary)];
}

export function hostedSaaSCheckoutProviderOrder(mode?: BillingProviderMode): SaasProviderId[] {
  const resolvedMode = mode ?? billingProviderModeFromEnvPrimary();
  return providerOrderForBillingMode(resolvedMode).filter((p) => isProviderRunnable(p));
}

export function modeIncludesStripe(mode: BillingProviderMode): boolean {
  return providerOrderForBillingMode(mode).includes('stripe');
}

export function isProviderRunnable(id: SaasProviderId): boolean {
  if (id === 'flutterwave') return isFlutterwaveConfigured();
  if (id === 'paystack') return isPaystackConfigured();
  if (id === 'stripe') return isStripeSaaSConfigured();
  return false;
}

export function getFlutterwaveSecretHash(): string | null {
  return trim(process.env.FLUTTERWAVE_SECRET_HASH);
}
