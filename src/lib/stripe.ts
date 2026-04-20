/**
 * Stripe SDK entry points for Connect + invoice Checkout only.
 * Platform SaaS subscriptions bill through Paddle — do not use this for workspace plans.
 */
export { getStripe, getStripeOrNull, createPaymentLink } from '@/lib/integrations/stripe-connect/client';
