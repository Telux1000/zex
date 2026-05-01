import type { Business, PaymentSettings } from '@/lib/database.types';

export type OnlineInvoiceProviderId = 'flutterwave' | 'paystack' | 'stripe';

const ALL: OnlineInvoiceProviderId[] = ['flutterwave', 'paystack', 'stripe'];

function preferenceOrder(
  start: OnlineInvoiceProviderId | null | undefined
): OnlineInvoiceProviderId[] {
  const s = (start && ALL.includes(start) ? start : 'flutterwave') as OnlineInvoiceProviderId;
  return [s, ...ALL.filter((p) => p !== s)];
}

function stripeConnectReady(settings: PaymentSettings, business: Business | null | undefined): boolean {
  if (!settings.enable_stripe_card) return false;
  if (business?.stripe_charges_enabled) return true;
  return settings.stripe_connect_status === 'connected' || settings.stripe_connected === true;
}

/**
 * Picks the first available online provider for hosted invoice pay links, honouring
 * the user's default (Flutterwave first when unset) then the remaining providers.
 * Flutterwave / Paystack merchant card flows are toggles for future use; when false,
 * Stripe is used if connected.
 */
export function resolveOnlineInvoiceProvider(
  settings: PaymentSettings | null | undefined,
  business: Business | null | undefined
): OnlineInvoiceProviderId | null {
  const s = (settings || {}) as PaymentSettings;
  const b = business ?? null;
  const order = preferenceOrder(s.default_online_payment_provider);
  for (const p of order) {
    if (p === 'stripe' && stripeConnectReady(s, b)) return 'stripe';
    // Merchant Flutterwave / Paystack invoice pay links: enable toggles are visible; wire APIs before returning true.
    if (p === 'flutterwave' && s.enable_flutterwave && isFlutterwaveInvoicesReady()) {
      return 'flutterwave';
    }
    if (p === 'paystack' && s.enable_paystack && isPaystackInvoicesReady()) {
      return 'paystack';
    }
  }
  return null;
}

function isFlutterwaveInvoicesReady(): boolean {
  return false;
}

function isPaystackInvoicesReady(): boolean {
  return false;
}
