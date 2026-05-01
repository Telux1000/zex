import type { BillingProviderMode } from '@/lib/billing/saas-billing-config';

export type CardCheckoutProvider = 'flutterwave' | 'paystack';

type ProviderChoicePolicy = {
  requiresChoice: boolean;
  recommendedProvider: CardCheckoutProvider | null;
  allowedProviders: CardCheckoutProvider[];
};

export function parseCardCheckoutProvider(value: unknown): CardCheckoutProvider | null {
  if (value === 'flutterwave' || value === 'paystack') return value;
  return null;
}

export function cardCheckoutProviderPolicy(mode: BillingProviderMode): ProviderChoicePolicy {
  if (mode === 'flutterwave_only') {
    return {
      requiresChoice: false,
      recommendedProvider: 'flutterwave',
      allowedProviders: ['flutterwave'],
    };
  }
  if (mode === 'paystack_only') {
    return {
      requiresChoice: false,
      recommendedProvider: 'paystack',
      allowedProviders: ['paystack'],
    };
  }
  if (mode === 'flutterwave_primary_paystack_fallback') {
    return {
      requiresChoice: true,
      recommendedProvider: 'flutterwave',
      allowedProviders: ['flutterwave', 'paystack'],
    };
  }
  if (mode === 'paystack_primary_flutterwave_fallback') {
    return {
      requiresChoice: true,
      recommendedProvider: 'paystack',
      allowedProviders: ['paystack', 'flutterwave'],
    };
  }
  return {
    requiresChoice: false,
    recommendedProvider: null,
    allowedProviders: [],
  };
}

export function isCardCheckoutProviderAllowed(
  mode: BillingProviderMode,
  provider: CardCheckoutProvider
): boolean {
  return cardCheckoutProviderPolicy(mode).allowedProviders.includes(provider);
}
