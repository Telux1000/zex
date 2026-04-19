/**
 * Back-compat re-exports for Stripe Connect and invoice payment links.
 * Prefer importing from `@/lib/integrations/stripe-connect/client` in new code.
 */
export { getStripe, getStripeOrNull, createPaymentLink } from '@/lib/integrations/stripe-connect/client';
