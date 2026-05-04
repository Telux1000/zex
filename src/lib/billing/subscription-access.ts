import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planIsFree, PRICING_TRIAL_DAYS, normalizeBillingPlan, type BillingPlan } from '@/lib/billing/plans';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

function normalizePlanSelectionStatusLocal(raw: unknown): string {
  switch (raw) {
    case 'FREE_SELECTED':
    case 'TRIAL_SELECTED':
    case 'PAID_PENDING_CHECKOUT':
    case 'PAID_ACTIVE':
      return raw;
    default:
      return 'NOT_SELECTED';
  }
}

export type SubscriptionLifecycleStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'trial_expired'
  | 'cancelled';

export type ProfileSubscriptionFields = {
  subscription_status?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Effective lifecycle from DB row + wall clock (handles stale `trialing` after trial_ends_at). */
export function computeEffectiveSubscription(
  row: ProfileSubscriptionFields,
  nowMs: number = Date.now()
): {
  effective: SubscriptionLifecycleStatus;
  trialEndsAtIso: string | null;
} {
  const raw = String(row.subscription_status ?? 'active').toLowerCase() as SubscriptionLifecycleStatus;
  const trialEndIso = row.trial_ends_at ?? null;
  const trialEndMs = trialEndIso ? new Date(trialEndIso).getTime() : NaN;
  const trialEndValid = Number.isFinite(trialEndMs);

  if (raw === 'active') {
    return { effective: 'active', trialEndsAtIso: trialEndIso };
  }
  if (raw === 'cancelled') {
    return { effective: 'cancelled', trialEndsAtIso: trialEndIso };
  }
  if (raw === 'past_due') {
    return { effective: 'past_due', trialEndsAtIso: trialEndIso };
  }
  if (raw === 'trial_expired') {
    return { effective: 'trial_expired', trialEndsAtIso: trialEndIso };
  }

  if (raw === 'trialing') {
    if (trialEndValid && nowMs > trialEndMs) {
      return { effective: 'trial_expired', trialEndsAtIso: trialEndIso };
    }
    if (trialEndValid && nowMs <= trialEndMs) {
      return { effective: 'trialing', trialEndsAtIso: trialEndIso };
    }
    // Legacy row: trialing without end → treat as active to avoid locking accounts
    return { effective: 'active', trialEndsAtIso: null };
  }

  return { effective: 'active', trialEndsAtIso: trialEndIso };
}

export function trialDaysRemaining(trialEndsAtIso: string | null, nowMs: number = Date.now()): number | null {
  if (!trialEndsAtIso) return null;
  const end = new Date(trialEndsAtIso).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - nowMs) / DAY_MS);
}

export function trialUrgencyBannerDays(days: number | null): 7 | 3 | 1 | null {
  if (days == null || days < 0) return null;
  if (days <= 1) return 1;
  if (days <= 3) return 3;
  if (days <= 7) return 7;
  return null;
}

/** Blocks core writes for payment/cancel lapses — not trial expiry (Starter remains usable). */
export function coreWriteBlockedStatuses(): Set<SubscriptionLifecycleStatus> {
  return new Set<SubscriptionLifecycleStatus>(['past_due', 'cancelled']);
}

/** Billing / waitlist UI: show checkout urgency (includes ended trial without payment). */
export function subscriptionRequiresBillingAction(effective: SubscriptionLifecycleStatus): boolean {
  return coreWriteBlockedStatuses().has(effective) || effective === 'trial_expired';
}

export function subscriptionLapsedMessage(effective: SubscriptionLifecycleStatus): string {
  switch (effective) {
    case 'trial_expired':
      return 'Your trial has ended. You are on the free Starter plan. Upgrade to unlock paid features.';
    case 'past_due':
      return 'Your subscription payment failed. Update billing to restore full access.';
    case 'cancelled':
      return 'This subscription is cancelled. Upgrade to restore full access.';
    default:
      return 'Your workspace does not have active billing access for this action.';
  }
}

type ProfileReconcileRow = {
  billing_plan?: unknown;
  subscription_status?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  plan_selection_status?: unknown;
  trial_used?: boolean | null;
};

export async function ownerHasPaidEntitlement(
  admin: SupabaseClient,
  ownerUserId: string,
  profile: ProfileReconcileRow
): Promise<boolean> {
  const subStatus = String(profile.subscription_status ?? '').toLowerCase();
  const selection = normalizePlanSelectionStatusLocal(profile.plan_selection_status);
  if (selection === 'PAID_ACTIVE' && subStatus === 'active') {
    return true;
  }
  const { data } = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', ownerUserId)
    .eq('status', 'active')
    .maybeSingle();
  return Boolean(data);
}

/** Sidebar upgrade promo: hide for active paid; show for Starter/free, trialing, or trial_expired. */
export function shouldShowDashboardSidebarUpgradeCard(input: {
  paidEntitlement: boolean;
  billingPlan: BillingPlan;
  effectiveLifecycle: SubscriptionLifecycleStatus;
}): boolean {
  if (input.paidEntitlement) return false;
  if (planIsFree(input.billingPlan)) return true;
  if (input.effectiveLifecycle === 'trialing') return true;
  if (input.effectiveLifecycle === 'trial_expired') return true;
  return false;
}

/**
 * Uses workspace owner `profiles` + subscription fields (after reconcile). Does not re-run reconcile.
 */
export async function resolveShowDashboardSidebarUpgradeCard(
  supabase: SupabaseClient,
  ownerUserId: string,
  ownerSub: ProfileSubscriptionFields | null
): Promise<boolean> {
  if (!ownerSub) return false;
  const admin = getSupabaseServiceAdmin();
  const client = admin ?? supabase;
  const { data: profile, error } = await client
    .from('profiles')
    .select('billing_plan, subscription_status, plan_selection_status')
    .eq('id', ownerUserId)
    .maybeSingle();
  if (error || !profile) return false;
  const row = profile as ProfileReconcileRow;
  const paid = admin
    ? await ownerHasPaidEntitlement(admin, ownerUserId, row)
    : normalizePlanSelectionStatusLocal(row.plan_selection_status) === 'PAID_ACTIVE' &&
      String(row.subscription_status ?? '').toLowerCase() === 'active';
  const { effective } = computeEffectiveSubscription(ownerSub);
  const billingPlan = normalizeBillingPlan(row.billing_plan);
  return shouldShowDashboardSidebarUpgradeCard({
    paidEntitlement: paid,
    billingPlan,
    effectiveLifecycle: effective,
  });
}

/**
 * Server-side source of truth: expire stale trials, downgrade profile to Starter when unpaid,
 * mark internal subscription rows expired, and persist `trial_used` (idempotent).
 */
export async function reconcileOwnerBillingEntitlements(ownerUserId: string): Promise<void> {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return;

  const { data: profile, error } = await admin
    .from('profiles')
    .select(
      'billing_plan, subscription_status, trial_started_at, trial_ends_at, plan_selection_status, trial_used'
    )
    .eq('id', ownerUserId)
    .maybeSingle();
  if (error || !profile) return;

  const paid = await ownerHasPaidEntitlement(admin, ownerUserId, profile as ProfileReconcileRow);
  if (paid) return;

  const row: ProfileSubscriptionFields = {
    subscription_status: (profile as ProfileReconcileRow).subscription_status,
    trial_started_at: (profile as ProfileReconcileRow).trial_started_at,
    trial_ends_at: (profile as ProfileReconcileRow).trial_ends_at,
  };
  const { effective } = computeEffectiveSubscription(row);
  const rawStatus = String((profile as ProfileReconcileRow).subscription_status ?? '').toLowerCase();
  const plan = normalizeBillingPlan((profile as ProfileReconcileRow).billing_plan);
  const selection = normalizePlanSelectionStatusLocal((profile as ProfileReconcileRow).plan_selection_status);

  const trialWindowEnded = effective === 'trial_expired';
  const needsProfileDowngrade =
    trialWindowEnded &&
    (!planIsFree(plan) ||
      rawStatus === 'trialing' ||
      selection === 'TRIAL_SELECTED' ||
      (rawStatus === 'trial_expired' && !planIsFree(plan)));

  if (needsProfileDowngrade) {
    await admin
      .from('profiles')
      .update({
        billing_plan: 'starter',
        subscription_status: 'trial_expired',
        plan_selection_status: 'FREE_SELECTED',
        selected_catalog_price_id: null,
        pending_checkout_provider: null,
        pending_checkout_plan: null,
        trial_used: true,
      })
      .eq('id', ownerUserId);
  } else if (rawStatus === 'trialing' && effective === 'trial_expired') {
    await admin
      .from('profiles')
      .update({ subscription_status: 'trial_expired', trial_used: true })
      .eq('id', ownerUserId);
  }

  if (trialWindowEnded) {
    await admin
      .from('subscriptions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('user_id', ownerUserId)
      .in('status', ['trialing', 'pending_checkout']);
  }
}

/**
 * @deprecated Prefer `reconcileOwnerBillingEntitlements`; retained for call sites that only need status flip.
 * @returns always false — callers should re-fetch profile/subscription row after reconcile.
 */
export async function reconcileSubscriptionStatusInDb(
  ownerUserId: string,
  _row?: ProfileSubscriptionFields
): Promise<boolean> {
  await reconcileOwnerBillingEntitlements(ownerUserId);
  return false;
}

export async function fetchOwnerSubscriptionRow(
  supabase: SupabaseClient,
  ownerUserId: string
): Promise<ProfileSubscriptionFields | null> {
  const admin = getSupabaseServiceAdmin();
  const client = admin ?? supabase;
  const { data, error } = await client
    .from('profiles')
    .select('subscription_status, trial_started_at, trial_ends_at')
    .eq('id', ownerUserId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProfileSubscriptionFields;
}

export async function getOwnerBillingPlanAfterReconcile(
  supabase: SupabaseClient,
  ownerUserId: string
): Promise<BillingPlan> {
  await reconcileOwnerBillingEntitlements(ownerUserId);
  const admin = getSupabaseServiceAdmin();
  const client = admin ?? supabase;
  const { data } = await client
    .from('profiles')
    .select('billing_plan')
    .eq('id', ownerUserId)
    .maybeSingle();
  return normalizeBillingPlan((data as { billing_plan?: unknown } | null)?.billing_plan);
}

export type WorkspaceWriteGateResult =
  | { ok: true; ownerId: string; effective: SubscriptionLifecycleStatus; row: ProfileSubscriptionFields }
  | { ok: false; response: NextResponse };

/**
 * Enforces workspace-level subscription for mutating product actions (owner = subscriber).
 */
export async function assertWorkspaceCoreWriteAccess(
  supabase: SupabaseClient,
  businessOwnerId: string
): Promise<WorkspaceWriteGateResult> {
  await reconcileOwnerBillingEntitlements(businessOwnerId);
  const row = await fetchOwnerSubscriptionRow(supabase, businessOwnerId);
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Could not load subscription state.' }, { status: 500 }),
    };
  }

  const { effective } = computeEffectiveSubscription(row);

  if (coreWriteBlockedStatuses().has(effective)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: subscriptionLapsedMessage(effective),
          code: 'subscription_inactive',
          subscription_status: effective,
          cta: 'Upgrade',
          cta_href: '/dashboard/billing',
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, ownerId: businessOwnerId, effective, row };
}

/** Profile rows before pricing selection: no trial window yet; full app access after pricing + trial start. */
export function profileBillingBeforePlanSelection(): {
  trial_started_at: null;
  trial_ends_at: null;
  subscription_status: 'active';
} {
  return {
    trial_started_at: null,
    trial_ends_at: null,
    subscription_status: 'active',
  };
}

/** Draft → issued / scheduled send while trial or subscription lapsed. */
export function isInvoiceIssuancePayload(
  body: Record<string, unknown>,
  invoiceRawStatus: string
): boolean {
  const raw = String(invoiceRawStatus ?? '').toLowerCase();
  if (raw !== 'draft') return false;
  const sched = body.scheduled_send_at;
  if (sched != null && String(sched).trim() !== '') return true;
  const next = body.status != null ? String(body.status).toLowerCase().trim() : '';
  if (next && ['sent', 'pending', 'viewed'].includes(next)) return true;
  return false;
}

export function newAccountTrialFields(
  now: Date = new Date(),
  trialDays: number = PRICING_TRIAL_DAYS
): {
  trial_started_at: string;
  trial_ends_at: string;
  subscription_status: SubscriptionLifecycleStatus;
} {
  const days = Number.isFinite(trialDays) && trialDays >= 0 ? Math.floor(trialDays) : PRICING_TRIAL_DAYS;
  const ends = new Date(now);
  ends.setUTCDate(ends.getUTCDate() + days);
  return {
    trial_started_at: now.toISOString(),
    trial_ends_at: ends.toISOString(),
    subscription_status: 'trialing',
  };
}
