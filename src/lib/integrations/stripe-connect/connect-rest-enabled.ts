/**
 * When false (default), Connect onboarding/sync REST routes do not call the Stripe API.
 * Connect is for merchant card payouts on customer invoices; platform plans bill via Flutterwave / Paystack.
 * Set STRIPE_CONNECT_ENABLED=true to re-enable Connect API routes.
 */
export function isStripeConnectRestApiEnabled(): boolean {
  return process.env.STRIPE_CONNECT_ENABLED === 'true';
}
