/**
 * Checkout redirects encode our internal subscription id in provider references
 * (see flutterwave-saas / paystack-saas).
 */

function uuidFromCompact32(compact: string): string | null {
  const c = compact.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(c)) return null;
  return `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;
}

const FLUTTERWAVE_TX_REF_PREFIX = 'zx_';
/** Legacy Paystack-only prefix; new SaaS Paystack fallback uses the same ref as Flutterwave (`zx_` + uuid). */
const PAYSTACK_LEGACY_REFERENCE_PREFIX = 'zx_ps_';

/** Shared hosted-checkout reference (Flutterwave `tx_ref` and Paystack fallback `reference`). */
export function saasHostedCheckoutReference(internalSubscriptionId: string): string {
  return `${FLUTTERWAVE_TX_REF_PREFIX}${internalSubscriptionId.replace(/-/g, '')}`;
}

export function subscriptionIdFromFlutterwaveTxRef(txRef: string): string | null {
  if (!txRef.startsWith(FLUTTERWAVE_TX_REF_PREFIX)) return null;
  const rest = txRef.slice(FLUTTERWAVE_TX_REF_PREFIX.length);
  if (rest.startsWith('ps_')) return null;
  return uuidFromCompact32(rest);
}

export function subscriptionIdFromPaystackReference(reference: string): string | null {
  if (reference.startsWith(PAYSTACK_LEGACY_REFERENCE_PREFIX)) {
    return uuidFromCompact32(reference.slice(PAYSTACK_LEGACY_REFERENCE_PREFIX.length));
  }
  if (reference.startsWith(FLUTTERWAVE_TX_REF_PREFIX)) {
    const rest = reference.slice(FLUTTERWAVE_TX_REF_PREFIX.length);
    if (rest.startsWith('ps_')) return null;
    return uuidFromCompact32(rest);
  }
  return null;
}
