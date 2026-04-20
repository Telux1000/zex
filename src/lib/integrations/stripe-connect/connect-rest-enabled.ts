/**
 * When false (default), Connect onboarding/sync REST routes do not call the Stripe API.
 * Platform SaaS subscriptions use Paddle; Connect is optional for merchant card payouts on invoices.
 * Set STRIPE_CONNECT_ENABLED=true to re-enable Connect API routes.
 */
export function isStripeConnectRestApiEnabled(): boolean {
  return process.env.STRIPE_CONNECT_ENABLED === 'true';
}
