import { BillingConfigurationError, BillingProviderError } from '@/lib/billing/billing-types';

/** Stored on waitlist rows and echoed to clients for UX / analytics. */
export type WaitlistTriggerReason =
  | 'currency_not_supported'
  | 'provider_failed'
  | 'no_payment_provider'
  | 'region_unavailable'
  | 'configuration'
  | 'feature_locked'
  | 'general';

export type WaitlistSource =
  | 'landing'
  | 'pricing'
  | 'payment_error'
  | 'region_block'
  | 'feature_locked'
  | string;

export type CheckoutWaitlistPayload = {
  trigger_reason: WaitlistTriggerReason;
  /** Checkout failures always attribute to this source. */
  source: 'payment_error';
};

const REGION_PAYMENT_COPY = "Payment isn't available for your region yet.";

export function classifyCheckoutFailureForWaitlist(e: unknown): {
  httpStatus: number;
  userMessage: string;
  waitlist: CheckoutWaitlistPayload;
} | null {
  if (e instanceof BillingProviderError) {
    const m = e.message.toLowerCase();
    if (m.includes('unsupported') && m.includes('currency')) {
      return {
        httpStatus: 503,
        userMessage: REGION_PAYMENT_COPY,
        waitlist: { trigger_reason: 'currency_not_supported', source: 'payment_error' },
      };
    }
    return {
      httpStatus: 503,
      userMessage: REGION_PAYMENT_COPY,
      waitlist: { trigger_reason: 'provider_failed', source: 'payment_error' },
    };
  }
  if (e instanceof BillingConfigurationError) {
    const m = e.message.toLowerCase();
    if (m.includes('no billing provider')) {
      return {
        httpStatus: 503,
        userMessage: REGION_PAYMENT_COPY,
        waitlist: { trigger_reason: 'no_payment_provider', source: 'payment_error' },
      };
    }
    return {
      httpStatus: 503,
      userMessage: REGION_PAYMENT_COPY,
      waitlist: { trigger_reason: 'configuration', source: 'payment_error' },
    };
  }
  return null;
}

export function classifyUnknownCheckoutErrorForWaitlist(message: string): CheckoutWaitlistPayload {
  const lower = message.toLowerCase();
  if (lower.includes('currency') && (lower.includes('unsupported') || lower.includes('not supported'))) {
    return { trigger_reason: 'currency_not_supported', source: 'payment_error' };
  }
  return { trigger_reason: 'provider_failed', source: 'payment_error' };
}
