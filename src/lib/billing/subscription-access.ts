import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PRICING_TRIAL_DAYS } from '@/lib/billing/plans';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

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

export function coreWriteBlockedStatuses(): Set<SubscriptionLifecycleStatus> {
  return new Set<SubscriptionLifecycleStatus>(['trial_expired', 'past_due', 'cancelled']);
}

export function subscriptionLapsedMessage(effective: SubscriptionLifecycleStatus): string {
  switch (effective) {
    case 'trial_expired':
      return 'Your trial has ended. Choose a plan and add payment to continue creating and sending invoices.';
    case 'past_due':
      return 'Your subscription payment failed. Update billing to restore full access.';
    case 'cancelled':
      return 'This subscription is cancelled. Upgrade to restore full access.';
    default:
      return 'Your workspace does not have active billing access for this action.';
  }
}

/**
 * Persist trial_expired when DB still says trialing but window ended (service role).
 * @returns true when a row was updated — callers can merge `subscription_status: 'trial_expired'`
 *   in-memory and skip a re-fetch; false when no DB write.
 */
export async function reconcileSubscriptionStatusInDb(
  ownerUserId: string,
  row: ProfileSubscriptionFields
): Promise<boolean> {
  const { effective } = computeEffectiveSubscription(row);
  if (String(row.subscription_status).toLowerCase() !== 'trialing' || effective !== 'trial_expired') {
    return false;
  }
  const admin = getSupabaseServiceAdmin();
  if (!admin) return false;
  const { error } = await admin
    .from('profiles')
    .update({ subscription_status: 'trial_expired' })
    .eq('id', ownerUserId);
  return !error;
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
  const row = await fetchOwnerSubscriptionRow(supabase, businessOwnerId);
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Could not load subscription state.' }, { status: 500 }),
    };
  }

  const didReconcile = await reconcileSubscriptionStatusInDb(businessOwnerId, row);
  const fresh: ProfileSubscriptionFields = didReconcile
    ? { ...row, subscription_status: 'trial_expired' }
    : row;
  const { effective } = computeEffectiveSubscription(fresh);

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

  return { ok: true, ownerId: businessOwnerId, effective, row: fresh };
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

/** Initial trial fields for a brand-new profile (one trial per account). */
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
