/**
 * Stripe SDK entry points for Connect + invoice Checkout only.
 * Platform SaaS subscriptions use Flutterwave / Paystack (see `lib/billing`); this module is for Connect invoice charges only.
 */
export { getStripe, getStripeOrNull, createPaymentLink } from '@/lib/integrations/stripe-connect/client';
