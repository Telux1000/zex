import { Environment, Paddle } from '@paddle/paddle-node-sdk';

let paddleSingleton: Paddle | null = null;

/**
 * Server-side Paddle Billing client for platform SaaS checkout only.
 * Never instantiates at import time — safe when PADDLE_BILLING_API_KEY is unset.
 *
 * Env:
 * - PADDLE_BILLING_API_KEY — Billing API key (sandbox or live)
 * - PADDLE_BILLING_ENVIRONMENT — `sandbox` (default) or `production`
 */
export function getPaddleBillingClient(): Paddle | null {
  const key = process.env.PADDLE_BILLING_API_KEY?.trim();
  if (!key) return null;
  if (!paddleSingleton) {
    const env =
      process.env.PADDLE_BILLING_ENVIRONMENT?.trim().toLowerCase() === 'production'
        ? Environment.production
        : Environment.sandbox;
    paddleSingleton = new Paddle(key, { environment: env });
  }
  return paddleSingleton;
}
