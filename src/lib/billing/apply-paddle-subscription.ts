import type { SupabaseClient } from '@supabase/supabase-js';
import type { Paddle, SubscriptionNotification, SubscriptionStatus } from '@paddle/paddle-node-sdk';
import { normalizeBillingPlan, type BillingPlan } from '@/lib/billing/plans';
import { billingPlanFromCatalogPriceId } from '@/lib/billing/catalog-price-map';
import type { SubscriptionLifecycleStatus } from '@/lib/billing/subscription-access';

function ownerUserIdFromSubscription(sub: SubscriptionNotification): string | null {
  const raw = sub.customData?.saas_owner_user_id;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

async function ownerUserIdFromPaddleCustomer(
  paddle: Paddle,
  customerId: string
): Promise<string | null> {
  try {
    const c = await paddle.customers.get(customerId);
    const raw = c.customData?.saas_owner_user_id;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  } catch {
    /* ignore */
  }
  return null;
}

function planFromSubscription(sub: SubscriptionNotification): BillingPlan {
  const raw = sub.customData?.saas_billing_plan;
  if (typeof raw === 'string' && raw.trim()) {
    return normalizeBillingPlan(raw.trim());
  }
  const priceId = sub.items[0]?.price?.id ?? null;
  return billingPlanFromCatalogPriceId(priceId) ?? 'starter';
}

function mapPaddleStatusToProfile(status: SubscriptionStatus): SubscriptionLifecycleStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'cancelled';
    case 'paused':
      return 'past_due';
    default:
      return 'active';
  }
}

/**
 * Applies Paddle Billing subscription notification payload to `profiles` (workspace owner SaaS entitlements).
 * Resolves owner from subscription `custom_data` or, if missing, from the Paddle customer created at checkout.
 */
export async function applyPaddleSubscriptionNotification(
  admin: SupabaseClient,
  sub: SubscriptionNotification,
  paddle: Paddle | null
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let ownerUserId = ownerUserIdFromSubscription(sub);
  if (!ownerUserId && paddle) {
    ownerUserId = await ownerUserIdFromPaddleCustomer(paddle, sub.customerId);
  }
  if (!ownerUserId) {
    return { ok: false, reason: 'missing_saas_owner_user_id' };
  }

  const billing_plan = planFromSubscription(sub);
  const subscription_status = mapPaddleStatusToProfile(sub.status);
  const paidActive =
    subscription_status === 'active' || subscription_status === 'trialing';
  const nowIso = new Date().toISOString();

  await admin
    .from('profiles')
    .update({
      subscription_status,
      billing_plan,
      ...(paidActive
        ? {
            plan_selection_status: 'PAID_ACTIVE',
            onboarding_pricing_completed_at: nowIso,
            pending_checkout_provider: null,
            pending_checkout_plan: null,
            selected_plan_at: nowIso,
          }
        : {}),
    })
    .eq('id', ownerUserId);

  return { ok: true };
}
