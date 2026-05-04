import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BillingConfigurationError,
  type CheckoutContext,
  type CreateCheckoutResult,
  type SaasProviderId,
} from '@/lib/billing/billing-types';
import { billingLog } from '@/lib/billing/billing-logger';
import { planIsFree, type BillingPlan, type PlanBillingInterval, normalizeBillingPlan } from '@/lib/billing/plans';
import { internalCatalogKey } from '@/lib/billing/plan-provider-refs';
import {
  createFlutterwaveCheckout,
  verifyFlutterwaveTransactionById,
  verifyFlutterwaveWebhookHash,
} from '@/lib/billing/providers/flutterwave-saas';
import {
  createPaystackCheckout,
  inspectPaystackSecretConfig,
  verifyPaystackTransactionByReference,
} from '@/lib/billing/providers/paystack-saas';
import {
  subscriptionIdFromFlutterwaveTxRef,
  subscriptionIdFromPaystackReference,
} from '@/lib/billing/checkout-reference';
import type { BillingCheckoutServerPerf } from '@/lib/billing/billing-checkout-perf';
import { isRedirectCheckout, type CreateCheckoutRequest } from '@/lib/billing/billing-provider-interface';
import { paystackSubunitsToMajor } from '@/lib/billing/billing-amounts';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';
import {
  billingProviderModeFromEnvPrimary,
  hostedSaaSCheckoutProviderOrder,
  isStripeConfigured,
  modeIncludesStripe,
  normalizeBillingProviderMode,
} from '@/lib/billing/saas-billing-config';
import { createStripeCheckoutPlaceholder } from '@/lib/billing/providers/stripe-saas-stub';
import { markWaitlistConvertedOnPaidSubscription } from '@/lib/waitlist/mark-waitlist-converted';
import {
  isCardCheckoutProviderAllowed,
  parseCardCheckoutProvider,
  type CardCheckoutProvider,
} from '@/lib/billing/provider-choice';

/** Safe to log: no bearer tokens or obvious secret patterns. */
function checkoutFailureReason(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'checkout error';
  return raw
    .replace(/Bearer\s+[\w-._~+/]+/gi, 'Bearer [redacted]')
    .replace(/sk_(live|test)_[\w]+/gi, 'sk_[redacted]')
    .slice(0, 240);
}

function paystackSecret(): string {
  const k = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!k) return '';
  return k;
}

export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  const secret = paystackSecret();
  if (!secret || !signature) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const sigNorm = signature.trim().toLowerCase();
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sigNorm, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Creates pending row + returns checkout result using admin billing provider mode + fallback rules. */
export async function createSaaSCheckout(
  admin: SupabaseClient,
  ctx: CheckoutContext,
  req: CreateCheckoutRequest,
  perf?: BillingCheckoutServerPerf,
  selectedProviderInput?: unknown
): Promise<CreateCheckoutResult> {
  if (planIsFree(req.plan)) {
    throw new BillingConfigurationError('Plan does not require payment');
  }
  if (!ctx.userEmail) {
    billingLog.warn('checkout blocked: missing email for receipt');
  }

  const platform = await fetchAdminPlatformSettings(admin);
  const providerMode =
    normalizeBillingProviderMode(platform.billing_provider_mode) ?? billingProviderModeFromEnvPrimary();
  const selectedProvider = parseCardCheckoutProvider(selectedProviderInput);
  if (selectedProviderInput !== undefined && !selectedProvider) {
    throw new BillingConfigurationError('Invalid checkout provider selection.');
  }
  if (selectedProvider && !isCardCheckoutProviderAllowed(providerMode, selectedProvider)) {
    throw new BillingConfigurationError('Selected checkout provider is not allowed right now.');
  }

  const order = selectedProvider
    ? ([selectedProvider] as const)
    : hostedSaaSCheckoutProviderOrder(providerMode);
  billingLog.info(`provider_mode=${providerMode}`);
  if (modeIncludesStripe(providerMode) && !isStripeConfigured()) {
    billingLog.warn('stripe_not_configured_skipped=true');
  }
  if (order.length === 0) {
    throw new BillingConfigurationError(
      'No billing provider is available. Configure Flutterwave, Paystack, or Stripe (server environment).'
    );
  }

  const initialProvider: SaasProviderId = order[0]!;
  perf?.mark('subscription_pending_insert_before');
  const { data: subRow, error: subErr } = await admin
    .from('subscriptions')
    .insert({
      user_id: ctx.userId,
      business_id: ctx.businessId,
      plan_id: req.plan,
      status: 'pending_checkout' as const,
      provider: initialProvider,
    })
    .select('id')
    .single();
  perf?.mark('subscription_pending_insert_after');

  if (subErr || !subRow?.id) {
    throw new Error(subErr?.message ?? 'Could not start checkout');
  }
  const subscriptionId = subRow.id as string;

  let lastError: string | null = null;
  billingLog.info(`primary_provider=${order[0]}`);

  for (let i = 0; i < order.length; i++) {
    const p = order[i]!;
    perf?.mark('provider_attempt', { provider: p });
    billingLog.info(`checkout_provider_selected=${p}`);
    billingLog.info(`provider_selected=${p}`);
    if (i > 0 && lastError) {
      billingLog.warn('fallback_triggered=true');
      billingLog.warn('fallback triggered', { from: order[i - 1], to: p, reason: lastError });
    }
    try {
      if (p === 'flutterwave') {
        const r = await createFlutterwaveCheckout(
          { ...ctx, returnPath: ctx.returnPath || '/dashboard/billing' },
          subscriptionId,
          perf
        );
        if (!isRedirectCheckout(r)) throw new Error('expected redirect');
        perf?.mark('post_checkout_db_parallel_before');
        await Promise.all([
          admin.from('subscriptions').update({ provider: 'flutterwave' }).eq('id', subscriptionId),
          admin
            .from('profiles')
            .update({
              plan_selection_status: 'PAID_PENDING_CHECKOUT',
              pending_checkout_provider: 'flutterwave',
              pending_checkout_plan: req.plan,
              billing_plan: req.plan,
              billing_interval: req.interval,
              selected_catalog_price_id: internalCatalogKey('flutterwave', req.plan, req.interval),
              selected_plan_at: new Date().toISOString(),
            })
            .eq('id', ctx.userId),
        ]);
        perf?.mark('post_checkout_db_parallel_after');
        billingLog.info('checkout created', { provider: 'flutterwave' });
        return r;
      }
      if (p === 'paystack') {
        const cfg = inspectPaystackSecretConfig();
        billingLog.info(`paystack_config_present=${cfg.present}`);
        if (!cfg.validPrefix) billingLog.warn('paystack_secret_format_invalid=true');
        if (cfg.hasWhitespace) billingLog.warn('paystack_secret_whitespace_trimmed=true');
        const r = await createPaystackCheckout(
          { ...ctx, returnPath: ctx.returnPath || '/dashboard/billing' },
          subscriptionId,
          perf
        );
        if (!isRedirectCheckout(r)) throw new Error('expected redirect');
        perf?.mark('post_checkout_db_parallel_before');
        await Promise.all([
          admin.from('subscriptions').update({ provider: 'paystack' }).eq('id', subscriptionId),
          admin
            .from('profiles')
            .update({
              plan_selection_status: 'PAID_PENDING_CHECKOUT',
              pending_checkout_provider: 'paystack',
              pending_checkout_plan: req.plan,
              billing_plan: req.plan,
              billing_interval: req.interval,
              selected_catalog_price_id: internalCatalogKey('paystack', req.plan, req.interval),
              selected_plan_at: new Date().toISOString(),
            })
            .eq('id', ctx.userId),
        ]);
        perf?.mark('post_checkout_db_parallel_after');
        billingLog.info('checkout created', { provider: 'paystack' });
        return r;
      }
      if (p === 'stripe') {
        await createStripeCheckoutPlaceholder();
      }
    } catch (e) {
      lastError = checkoutFailureReason(e);
      billingLog.warn('checkout provider failed', { provider: p, reason: lastError });
    }
  }

  await admin.from('subscriptions').delete().eq('id', subscriptionId);
  throw new BillingConfigurationError(
    lastError ?? 'No billing provider is available. Configure Flutterwave, Paystack, or Stripe (server environment).'
  );
}

function addInterval(d: Date, interval: PlanBillingInterval): Date {
  const n = new Date(d);
  if (interval === 'yearly') {
    n.setUTCFullYear(n.getUTCFullYear() + 1);
  } else {
    n.setUTCMonth(n.getUTCMonth() + 1);
  }
  return n;
}

type ApplyPaymentInput = {
  provider: 'flutterwave' | 'paystack';
  /**
   * Provider transaction id (Flutterwave / Paystack). Used as `provider_event_id` and
   * `provider_payment_id` (scoped by `provider` uniqueness) for idempotency.
   */
  providerPaymentId: string;
  userId: string;
  businessId: string | null;
  subscriptionId: string;
  plan: BillingPlan;
  interval: PlanBillingInterval;
  amount: number;
  currency: string;
  paidAtIso: string;
  customerId?: string | null;
  subscriptionExternalId?: string | null;
  /** When set, stored as `billing_events.event_type` (e.g. provider webhook name). */
  billingEventType?: string;
};

/**
 * Idempotent: unique `billing_events (provider, provider_event_id)` on provider transaction id.
 * Updates profiles (feature gate) and subscriptions in sync.
 */
export async function applyVerifiedSuccessfulCharge(
  admin: SupabaseClient,
  input: ApplyPaymentInput
): Promise<{ applied: boolean; duplicate: boolean }> {
  const providerEventId = input.providerPaymentId;

  const { error: evErr } = await admin.from('billing_events').insert({
    provider: input.provider,
    provider_event_id: providerEventId,
    event_type: input.billingEventType ?? 'charge.success',
    normalized_event_type: 'checkout.completed',
    user_id: input.userId,
    business_id: input.businessId,
    raw_payload: {
      plan_id: input.plan,
      billing_interval: input.interval,
      amount: input.amount,
      currency: input.currency,
    },
    processed_at: new Date().toISOString(),
  });

  if (evErr) {
    const code = (evErr as { code?: string }).code;
    if (code === '23505') {
      billingLog.info('webhook duplicate ignored', { provider: input.provider, outcome: 'duplicate' });
      return { applied: false, duplicate: true };
    }
    throw new Error(evErr.message);
  }

  const { error: payErr } = await admin.from('billing_payments').insert({
    provider: input.provider,
    provider_payment_id: providerEventId,
    subscription_id: input.subscriptionId,
    amount: input.amount,
    currency: input.currency,
    status: 'successful',
    paid_at: input.paidAtIso,
  });
  if (payErr) {
    const code = (payErr as { code?: string }).code;
    if (code === '23505') {
      return { applied: false, duplicate: true };
    }
    throw new Error(payErr.message);
  }

  const now = new Date();
  const periodEnd = addInterval(now, input.interval);
  const nowIso = now.toISOString();

  await admin
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: nowIso,
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      provider: input.provider,
      provider_customer_id: input.customerId ?? null,
      provider_subscription_id: input.subscriptionExternalId ?? null,
    })
    .eq('id', input.subscriptionId);

  await admin
    .from('profiles')
    .update({
      subscription_status: 'active',
      billing_plan: input.plan,
      billing_interval: input.interval,
      selected_catalog_price_id: internalCatalogKey(input.provider, input.plan, input.interval),
      plan_selection_status: 'PAID_ACTIVE',
      pending_checkout_provider: null,
      pending_checkout_plan: null,
      onboarding_pricing_completed_at: nowIso,
      selected_plan_at: nowIso,
      trial_started_at: null,
      trial_ends_at: null,
      trial_used: true,
    })
    .eq('id', input.userId);

  const { data: profileForWaitlist } = await admin
    .from('profiles')
    .select('email')
    .eq('id', input.userId)
    .maybeSingle();
  await markWaitlistConvertedOnPaidSubscription(admin, input.userId, {
    userEmail: profileForWaitlist?.email ?? null,
    providerCustomerId: input.customerId ?? null,
  });

  billingLog.info('subscription activated', { userId: input.userId, plan: input.plan });
  return { applied: true, duplicate: false };
}

function parseMeta(
  raw: unknown
): { user_id?: string; subscription_id?: string; plan_id?: string; billing_interval?: string; business_id?: string } {
  if (!raw || typeof raw !== 'object') return {};
  const m = raw as Record<string, unknown>;
  return {
    user_id: typeof m.user_id === 'string' ? m.user_id : undefined,
    subscription_id: typeof m.subscription_id === 'string' ? m.subscription_id : undefined,
    plan_id: typeof m.plan_id === 'string' ? m.plan_id : undefined,
    billing_interval: typeof m.billing_interval === 'string' ? m.billing_interval : undefined,
    business_id: typeof m.business_id === 'string' ? m.business_id : undefined,
  };
}

type SaasChargeProvider = 'flutterwave' | 'paystack';

type ResolvedSaaSCharge = {
  subscriptionId: string;
  userId: string;
  businessId: string | null;
  plan: BillingPlan;
  interval: PlanBillingInterval;
};

/**
 * Resolve internal subscription from provider reference (`tx_ref` / Paystack `reference`)
 * returned by the verify API, cross-check optional metadata from the same verified payload.
 */
async function resolveSaaSChargeFromVerifiedReference(
  admin: SupabaseClient,
  args: { provider: SaasChargeProvider; subscriptionIdFromRef: string; meta: ReturnType<typeof parseMeta> }
): Promise<ResolvedSaaSCharge | null> {
  const { data: sub, error } = await admin
    .from('subscriptions')
    .select('id, user_id, business_id, plan_id, provider')
    .eq('id', args.subscriptionIdFromRef)
    .maybeSingle();

  if (error || !sub) {
    billingLog.warn('subscription resolve failed', { provider: args.provider, outcome: 'failure' });
    return null;
  }

  if (sub.provider !== args.provider) {
    billingLog.warn('subscription provider mismatch', { provider: args.provider, outcome: 'failure' });
    return null;
  }

  const m = args.meta;
  if (m.user_id && m.user_id !== sub.user_id) {
    billingLog.warn('verified metadata mismatch', { provider: args.provider, field: 'user', outcome: 'failure' });
    return null;
  }
  if (m.subscription_id && m.subscription_id !== sub.id) {
    billingLog.warn('verified metadata mismatch', { provider: args.provider, field: 'subscription', outcome: 'failure' });
    return null;
  }

  const plan = normalizeBillingPlan(String(sub.plan_id));
  if (m.plan_id && normalizeBillingPlan(m.plan_id) !== plan) {
    billingLog.warn('verified metadata mismatch', { provider: args.provider, field: 'plan', outcome: 'failure' });
    return null;
  }

  if (m.business_id && sub.business_id && m.business_id !== sub.business_id) {
    billingLog.warn('verified metadata mismatch', { provider: args.provider, field: 'business', outcome: 'failure' });
    return null;
  }

  const { data: prof } = await admin
    .from('profiles')
    .select('billing_interval')
    .eq('id', sub.user_id)
    .maybeSingle();

  const interval: PlanBillingInterval =
    prof?.billing_interval === 'monthly' || prof?.billing_interval === 'yearly'
      ? prof.billing_interval
      : m.billing_interval === 'monthly'
        ? 'monthly'
        : m.billing_interval === 'yearly'
          ? 'yearly'
          : 'yearly';

  return {
    subscriptionId: sub.id as string,
    userId: sub.user_id as string,
    businessId: (sub.business_id as string | null) ?? (m.business_id ?? null),
    plan,
    interval,
  };
}

export async function handleFlutterwaveChargeWebhook(
  admin: SupabaseClient,
  args: { rawBody: string; headers: Headers }
): Promise<{ received: true; duplicate?: boolean; ignored?: boolean }> {
  const hash = args.headers.get('verif-hash');
  if (!verifyFlutterwaveWebhookHash(hash)) {
    billingLog.warn('webhook verification failed', { provider: 'flutterwave', step: 'verif-hash' });
    return { received: true, ignored: true };
  }

  let body: { event?: string; data?: { id?: number; created_at?: string; meta?: unknown } };
  try {
    body = JSON.parse(args.rawBody) as typeof body;
  } catch {
    billingLog.warn('webhook parse failed', { provider: 'flutterwave' });
    return { received: true, ignored: true };
  }

  const eventType = body?.event ?? 'unknown';
  billingLog.info('webhook event', { provider: 'flutterwave', event: eventType });

  if (body?.event !== 'charge.completed' || !body.data?.id) {
    billingLog.info('webhook ignored', { provider: 'flutterwave', event: eventType, reason: 'unsupported_or_payload' });
    return { received: true, ignored: true };
  }

  let v: Awaited<ReturnType<typeof verifyFlutterwaveTransactionById>>;
  try {
    v = await verifyFlutterwaveTransactionById(body.data.id);
  } catch {
    billingLog.warn('webhook provider verify failed', { provider: 'flutterwave', event: eventType, outcome: 'failure' });
    throw new Error('Flutterwave verify failed');
  }

  if (v.status !== 'successful') {
    billingLog.info('webhook ignored', { provider: 'flutterwave', event: eventType, outcome: 'not_successful' });
    return { received: true, ignored: true };
  }

  const subscriptionIdFromRef = subscriptionIdFromFlutterwaveTxRef(v.tx_ref);
  if (!subscriptionIdFromRef) {
    billingLog.warn('webhook ignored', { provider: 'flutterwave', event: eventType, reason: 'tx_ref_unrecognized' });
    return { received: true, ignored: true };
  }

  const meta = parseMeta(v.meta ?? body.data.meta);
  const resolved = await resolveSaaSChargeFromVerifiedReference(admin, {
    provider: 'flutterwave',
    subscriptionIdFromRef: subscriptionIdFromRef,
    meta,
  });
  if (!resolved) {
    billingLog.info('webhook ignored', { provider: 'flutterwave', event: eventType, outcome: 'resolve_failed' });
    return { received: true, ignored: true };
  }

  const paidAtSource = v.created_at ?? body.data.created_at;
  const paidAtIso =
    paidAtSource && !Number.isNaN(Date.parse(paidAtSource))
      ? new Date(paidAtSource).toISOString()
      : new Date().toISOString();

  const r = await applyVerifiedSuccessfulCharge(admin, {
    provider: 'flutterwave',
    billingEventType: 'charge.completed',
    providerPaymentId: String(v.id),
    userId: resolved.userId,
    businessId: resolved.businessId,
    subscriptionId: resolved.subscriptionId,
    plan: resolved.plan,
    interval: resolved.interval,
    amount: v.amount,
    currency: (v.currency ?? 'USD').toUpperCase(),
    paidAtIso,
    customerId: v.customer?.id != null ? String(v.customer.id) : null,
    subscriptionExternalId: v.tx_ref,
  });

  if (r.duplicate) {
    billingLog.info('webhook duplicate ignored', { provider: 'flutterwave', event: eventType, outcome: 'duplicate' });
  } else {
    billingLog.info('webhook processed', { provider: 'flutterwave', event: eventType, outcome: 'success' });
  }
  return { received: true, duplicate: r.duplicate };
}

export async function handlePaystackEventWebhook(
  admin: SupabaseClient,
  args: { rawBody: string; headers: Headers }
): Promise<{ received: true; duplicate?: boolean; ignored?: boolean }> {
  const sig = args.headers.get('x-paystack-signature');
  if (!verifyPaystackSignature(args.rawBody, sig)) {
    billingLog.warn('webhook verification failed', { provider: 'paystack', step: 'x-paystack-signature' });
    return { received: true, ignored: true };
  }

  let ev: { event?: string; data?: { reference?: string } } | null = null;
  try {
    ev = JSON.parse(args.rawBody) as { event?: string; data?: { reference?: string } };
  } catch {
    billingLog.warn('webhook parse failed', { provider: 'paystack' });
    return { received: true, ignored: true };
  }

  const eventType = ev?.event ?? 'unknown';
  billingLog.info('webhook event', { provider: 'paystack', event: eventType });

  if (ev?.event !== 'charge.success' || !ev.data?.reference) {
    billingLog.info('webhook ignored', { provider: 'paystack', event: eventType, reason: 'unsupported_or_payload' });
    return { received: true, ignored: true };
  }

  let d: Awaited<ReturnType<typeof verifyPaystackTransactionByReference>>;
  try {
    d = await verifyPaystackTransactionByReference(ev.data.reference);
  } catch {
    billingLog.warn('webhook provider verify failed', { provider: 'paystack', event: eventType, outcome: 'failure' });
    throw new Error('Paystack verify failed');
  }

  if (d.status !== 'success') {
    billingLog.info('webhook ignored', { provider: 'paystack', event: eventType, outcome: 'not_successful' });
    return { received: true, ignored: true };
  }

  const subscriptionIdFromRef = subscriptionIdFromPaystackReference(d.reference);
  if (!subscriptionIdFromRef) {
    billingLog.warn('webhook ignored', { provider: 'paystack', event: eventType, reason: 'reference_unrecognized' });
    return { received: true, ignored: true };
  }

  const meta = parseMeta(d.metadata);
  const resolved = await resolveSaaSChargeFromVerifiedReference(admin, {
    provider: 'paystack',
    subscriptionIdFromRef,
    meta,
  });
  if (!resolved) {
    billingLog.info('webhook ignored', { provider: 'paystack', event: eventType, outcome: 'resolve_failed' });
    return { received: true, ignored: true };
  }

  const r = await applyVerifiedSuccessfulCharge(admin, {
    provider: 'paystack',
    billingEventType: 'charge.success',
    providerPaymentId: String(d.id),
    userId: resolved.userId,
    businessId: resolved.businessId,
    subscriptionId: resolved.subscriptionId,
    plan: resolved.plan,
    interval: resolved.interval,
    amount: paystackSubunitsToMajor(d.amount, d.currency ?? 'NGN'),
    currency: (d.currency ?? 'NGN').toUpperCase(),
    paidAtIso: d.paid_at ? new Date(d.paid_at).toISOString() : new Date().toISOString(),
    customerId: d.customer?.id != null ? String(d.customer.id) : null,
    subscriptionExternalId: d.reference,
  });

  if (r.duplicate) {
    billingLog.info('webhook duplicate ignored', { provider: 'paystack', event: eventType, outcome: 'duplicate' });
  } else {
    billingLog.info('webhook processed', { provider: 'paystack', event: eventType, outcome: 'success' });
  }
  return { received: true, duplicate: r.duplicate };
}

/**
 * Public verify (e.g. return URL) — re-verify with provider; idempotent.
 */
export async function verifyAndApplyFlutterwave(
  admin: SupabaseClient,
  transactionId: number
): Promise<{ ok: true; duplicate: boolean } | { ok: false; reason: string }> {
  const v = await verifyFlutterwaveTransactionById(transactionId);
  if (v.status !== 'successful') {
    return { ok: false, reason: 'not successful' };
  }
  const subscriptionIdFromRef = subscriptionIdFromFlutterwaveTxRef(v.tx_ref);
  if (!subscriptionIdFromRef) {
    return { ok: false, reason: 'tx_ref' };
  }
  const meta = parseMeta((v as { meta?: unknown }).meta);
  const resolved = await resolveSaaSChargeFromVerifiedReference(admin, {
    provider: 'flutterwave',
    subscriptionIdFromRef,
    meta,
  });
  if (!resolved) {
    return { ok: false, reason: 'subscription' };
  }
  const paidAtIso =
    v.created_at && !Number.isNaN(Date.parse(v.created_at))
      ? new Date(v.created_at).toISOString()
      : new Date().toISOString();
  const r = await applyVerifiedSuccessfulCharge(admin, {
    provider: 'flutterwave',
    providerPaymentId: String(v.id),
    userId: resolved.userId,
    businessId: resolved.businessId,
    subscriptionId: resolved.subscriptionId,
    plan: resolved.plan,
    interval: resolved.interval,
    amount: v.amount,
    currency: (v.currency ?? 'USD').toUpperCase(),
    paidAtIso,
    customerId: v.customer?.id != null ? String(v.customer.id) : null,
    subscriptionExternalId: v.tx_ref,
  });
  return { ok: true, duplicate: r.duplicate };
}

export async function verifyAndApplyPaystack(
  admin: SupabaseClient,
  reference: string
): Promise<{ ok: true; duplicate: boolean } | { ok: false; reason: string }> {
  const d = await verifyPaystackTransactionByReference(reference);
  if (d.status !== 'success') {
    return { ok: false, reason: 'not success' };
  }
  const subscriptionIdFromRef = subscriptionIdFromPaystackReference(d.reference);
  if (!subscriptionIdFromRef) {
    return { ok: false, reason: 'reference' };
  }
  const meta = parseMeta(d.metadata);
  const resolved = await resolveSaaSChargeFromVerifiedReference(admin, {
    provider: 'paystack',
    subscriptionIdFromRef,
    meta,
  });
  if (!resolved) {
    return { ok: false, reason: 'subscription' };
  }
  const r = await applyVerifiedSuccessfulCharge(admin, {
    provider: 'paystack',
    providerPaymentId: String(d.id),
    userId: resolved.userId,
    businessId: resolved.businessId,
    subscriptionId: resolved.subscriptionId,
    plan: resolved.plan,
    interval: resolved.interval,
    amount: paystackSubunitsToMajor(d.amount, d.currency ?? 'NGN'),
    currency: (d.currency ?? 'NGN').toUpperCase(),
    paidAtIso: d.paid_at ? new Date(d.paid_at).toISOString() : new Date().toISOString(),
    customerId: d.customer?.id != null ? String(d.customer.id) : null,
    subscriptionExternalId: d.reference,
  });
  return { ok: true, duplicate: r.duplicate };
}

/**
 * For failed renewals, map to past_due on profile + subscription.
 * Placeholder: extend when we subscribe to provider dunning webhooks.
 */
export async function markSubscriptionPastDue(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  await admin.from('profiles').update({ subscription_status: 'past_due' }).eq('id', userId);
  billingLog.info('payment failed', { userId });
}

export function extractBillingPlanFromRequest(body: Record<string, unknown>): {
  plan: BillingPlan;
  interval: PlanBillingInterval;
} | null {
  const p = body.plan_id ?? body.plan;
  const i = body.billing_interval ?? body.interval;
  if (p == null) return null;
  const plan = normalizeBillingPlan(p);
  const int: PlanBillingInterval = i === 'yearly' || i === 'monthly' ? i : 'yearly';
  if (planIsFree(plan)) return null;
  return { plan, interval: int };
}

export type { SaasProviderId };
