import type { BillingCheckoutServerPerf } from '@/lib/billing/billing-checkout-perf';
import { BillingProviderError, type CheckoutContext, type CreateCheckoutResult } from '@/lib/billing/billing-types';
import { saasHostedCheckoutReference } from '@/lib/billing/checkout-reference';
import {
  paystackAmountOverrideSubunits,
  paystackCheckoutCurrency,
} from '@/lib/billing/plan-provider-refs';
import { planTotalCentsForInterval } from '@/lib/billing/plan-charge-cents';
import { planIsFree } from '@/lib/billing/plans';
import { billingLog } from '@/lib/billing/billing-logger';

const API = 'https://api.paystack.co';
const PAYSTACK_SUPPORTED_CURRENCIES = new Set(['NGN', 'GHS', 'USD', 'ZAR', 'KES']);

export type PaystackConfigStatus = {
  present: boolean;
  validPrefix: boolean;
  hasWhitespace: boolean;
};

function normalizePaystackSecret(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return '';
  const withoutBearer = trimmed.replace(/^Bearer\s+/i, '');
  const unquoted = withoutBearer.replace(/^['"]|['"]$/g, '');
  return unquoted.trim();
}

export function inspectPaystackSecretConfig(): PaystackConfigStatus {
  const raw = process.env.PAYSTACK_SECRET_KEY;
  const trimmed = normalizePaystackSecret(raw);
  return {
    present: trimmed.length > 0,
    validPrefix: trimmed.startsWith('sk_test_') || trimmed.startsWith('sk_live_'),
    hasWhitespace: Boolean(raw && raw.trim() !== raw),
  };
}

function secret(): string {
  const k = normalizePaystackSecret(process.env.PAYSTACK_SECRET_KEY);
  if (!k) throw new BillingProviderError('PAYSTACK_SECRET_KEY is not set', 'paystack');
  if (!(k.startsWith('sk_test_') || k.startsWith('sk_live_'))) {
    throw new BillingProviderError('PAYSTACK_SECRET_KEY has invalid format', 'paystack');
  }
  return k;
}

function paystackFallbackCurrency(): string | null {
  const c =
    process.env.PAYSTACK_FALLBACK_CURRENCY?.trim() ??
    process.env.PAYSTACK_DEFAULT_CURRENCY?.trim() ??
    '';
  return c ? c.toUpperCase() : null;
}

function resolvePaystackCurrency(): string {
  const preferred = paystackCheckoutCurrency().toUpperCase();
  if (PAYSTACK_SUPPORTED_CURRENCIES.has(preferred)) return preferred;
  const fallback = paystackFallbackCurrency();
  if (fallback && PAYSTACK_SUPPORTED_CURRENCIES.has(fallback)) {
    billingLog.warn(`paystack_currency_fallback_used=${fallback}`);
    return fallback;
  }
  throw new BillingProviderError(`Unsupported Paystack currency: ${preferred}`, 'paystack');
}

function resolveCallbackBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    '';
  if (!raw) throw new BillingProviderError('Paystack callback URL is not configured.', 'paystack');
  try {
    const url = new URL(raw);
    if (!url.protocol.startsWith('http')) throw new Error('invalid protocol');
    return raw.replace(/\/$/, '');
  } catch {
    throw new BillingProviderError('Paystack callback URL is not configured.', 'paystack');
  }
}

/** Paystack `amount` is in the currency’s smallest unit (e.g. kobo for NGN, cents for USD). */
function paystackAmountSubunits(totalCents: number, currency: string): number {
  const c = currency.toUpperCase();
  if (c === 'JPY' || c === 'KRW') return Math.round(totalCents / 100);
  return Math.round(totalCents);
}

/**
 * POST /transaction/initialize — same `reference` as Flutterwave `tx_ref` for this subscription attempt.
 * Uses explicit `amount` + `currency` (no Paystack dashboard `plan` code) so fallback matches SaaS pricing.
 */
export async function createPaystackCheckout(
  ctx: CheckoutContext,
  internalSubscriptionId: string,
  perf?: BillingCheckoutServerPerf
): Promise<CreateCheckoutResult> {
  if (planIsFree(ctx.plan)) {
    throw new BillingProviderError('Cannot checkout a free plan', 'paystack');
  }
  const totalCents = planTotalCentsForInterval(ctx.plan, ctx.interval);
  if (totalCents <= 0) {
    throw new BillingProviderError('Invalid plan amount', 'paystack');
  }
  const currency = resolvePaystackCurrency();
  billingLog.info(`paystack_currency=${currency}`);
  const amountOverride = paystackAmountOverrideSubunits(ctx.plan, ctx.interval);
  const amount = amountOverride ?? paystackAmountSubunits(totalCents, currency);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BillingProviderError('Invalid Paystack amount', 'paystack');
  }

  const base = resolveCallbackBaseUrl();
  const reference = saasHostedCheckoutReference(internalSubscriptionId);
  const callbackUrl = `${base}${ctx.returnPath.startsWith('/') ? ctx.returnPath : `/${ctx.returnPath}`}`;
  const body: Record<string, unknown> = {
    email: ctx.userEmail ?? `user-${ctx.userId}@placeholder.zenzex.local`,
    amount,
    currency,
    callback_url: callbackUrl,
    reference,
    metadata: {
      subscription_id: internalSubscriptionId,
      user_id: ctx.userId,
      business_id: ctx.businessId,
      plan_id: ctx.plan,
      billing_interval: ctx.interval,
      billing_cycle: ctx.interval,
      provider: 'paystack',
    },
  };
  const config = inspectPaystackSecretConfig();
  billingLog.info(`paystack_config_present=${config.present}`);
  if (!config.validPrefix) billingLog.warn('paystack_secret_prefix_invalid=true');
  perf?.mark('paystack_api_request_start', { provider: 'paystack' });
  billingLog.info('paystack_request_start', {
    currency,
    ...(process.env.NODE_ENV === 'development' ? { amount_subunits: amount } : {}),
    has_business: Boolean(ctx.businessId),
    has_email: Boolean(ctx.userEmail),
    callback_path: ctx.returnPath,
  });
  const psHttpStart = Date.now();
  const res = await fetch(`${API}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };
  perf?.mark('paystack_api_request_done', {
    paystack_api_duration_ms: Date.now() - psHttpStart,
    provider: 'paystack',
  });
  billingLog.info(`paystack_response_status=${res.status}`);
  billingLog.info(`paystack_response_message=${String(json?.message ?? '').slice(0, 180)}`);
  if (!res.ok || !json.status || !json.data?.authorization_url) {
    const errorCode =
      (json as { code?: unknown }).code ??
      (json as { data?: { code?: unknown } }).data?.code ??
      'unknown';
    const errorMessage = typeof json?.message === 'string' ? json.message : 'Paystack init failed';
    billingLog.warn(`paystack_error_code=${String(errorCode)}`);
    billingLog.warn(`paystack_error_message=${errorMessage.slice(0, 180)}`);
    const msg = typeof json?.message === 'string' ? json.message : 'Paystack init failed';
    throw new BillingProviderError(msg, 'paystack');
  }
  return {
    kind: 'redirect',
    provider: 'paystack',
    redirectUrl: json.data.authorization_url,
    internalSubscriptionId,
  };
}

export type PaystackVerifyData = {
  id: number;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  customer?: { email?: string; id?: number };
  paid_at?: string;
  metadata?: Record<string, unknown> | null;
};

export async function verifyPaystackTransactionByReference(ref: string): Promise<PaystackVerifyData> {
  const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${secret()}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: PaystackVerifyData;
  };
  if (!res.ok || !json.status || !json.data) {
    const msg = typeof json?.message === 'string' ? json.message : 'verify failed';
    throw new BillingProviderError(msg, 'paystack');
  }
  return json.data;
}
