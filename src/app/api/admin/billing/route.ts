import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import {
  computeDerivedTrialEndsAt,
  isSubscriptionCancelled,
  isSubscriptionTrialing,
  isTrialEndInFuture,
  normalizeSubscriptionStatus,
  pickLatestSubscriptionByBusiness,
} from '@/lib/admin/billing-subscription-status';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

const PLAN_MONTHLY_USD_CENTS: Record<string, number> = {
  starter: 0,
  growth: 1900,
  professional: 3900,
  enterprise: 7900,
};

function normalizePlan(value: unknown): keyof typeof PLAN_MONTHLY_USD_CENTS {
  return value === 'growth' || value === 'professional' || value === 'enterprise' ? value : 'starter';
}

function computeNextRenewalIso(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const base = new Date(startedAt);
  if (Number.isNaN(base.getTime())) return null;
  const now = new Date();
  const next = new Date(base);
  next.setMonth(now.getMonth(), base.getDate());
  next.setFullYear(now.getFullYear());
  if (next <= now) next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

type SubscriptionProbeResult = {
  table: string | null;
  rows: Record<string, unknown>[];
};

async function loadSubscriptionRows(
  admin: NonNullable<ReturnType<typeof getSupabaseServiceAdmin>>
): Promise<SubscriptionProbeResult> {
  const candidates = ['subscriptions', 'billing_subscriptions'];
  for (const table of candidates) {
    const res = await admin.from(table).select('*').limit(5000);
    if (res.error) {
      if (res.error.code === '42P01') continue;
      return { table, rows: [] };
    }
    return { table, rows: (res.data as Record<string, unknown>[] | null) ?? [] };
  }
  return { table: null, rows: [] };
}

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const [profilesRes, businessesRes, authUsersRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, billing_plan, created_at, full_name, email, subscriber_admin_suspended_at, subscriber_admin_deactivated_at')
      .limit(2500),
    supabase
      .from('businesses')
      .select('id, name, owner_id, created_at, admin_suspended_at, admin_deactivated_at')
      .order('created_at', { ascending: false })
      .limit(250),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const subscriptionsProbe = await loadSubscriptionRows(admin);

  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  if (businessesRes.error) return NextResponse.json({ error: businessesRes.error.message }, { status: 500 });

  const authById = new Map((authUsersRes.data?.users ?? []).map((u) => [String(u.id), u]));
  const profilesById = new Map((profilesRes.data ?? []).map((p) => [String(p.id), p]));
  const businessByOwnerId = new Map<string, string>();
  for (const b of businessesRes.data ?? []) {
    const ownerId = String(b.owner_id);
    if (!businessByOwnerId.has(ownerId)) businessByOwnerId.set(ownerId, String(b.id));
  }

  const subscriptionsByBusiness = pickLatestSubscriptionByBusiness(
    subscriptionsProbe.rows,
    (row) => {
      const direct =
        (typeof row.business_id === 'string' && row.business_id) ||
        (typeof row.account_id === 'string' && row.account_id) ||
        (typeof row.workspace_id === 'string' && row.workspace_id) ||
        (typeof row.tenant_id === 'string' && row.tenant_id) ||
        (typeof row.company_id === 'string' && row.company_id) ||
        null;
      if (direct) return direct;

      const ownerLike =
        (typeof row.owner_id === 'string' && row.owner_id) ||
        (typeof row.user_id === 'string' && row.user_id) ||
        (typeof row.profile_id === 'string' && row.profile_id) ||
        null;
      if (!ownerLike) return null;
      return businessByOwnerId.get(ownerLike) ?? null;
    }
  );

  const accounts = (businessesRes.data ?? []).map((b) => {
    const owner = profilesById.get(String(b.owner_id));
    const ownerAuth = authById.get(String(b.owner_id));
    const startedAt = owner?.created_at ?? b.created_at;
    const plan = normalizePlan(owner?.billing_plan);
    const subscription = subscriptionsByBusiness.get(String(b.id));
    const cancelledFromSubscription = subscription
      ? isSubscriptionCancelled(subscription)
      : false;
    const normalizedSubStatus = normalizeSubscriptionStatus(subscription?.status ?? null);
    const suspended = Boolean(b.admin_suspended_at || owner?.subscriber_admin_suspended_at || ownerAuth?.banned_until);
    const cancelled = Boolean(b.admin_deactivated_at || owner?.subscriber_admin_deactivated_at || cancelledFromSubscription);
    const effectiveTrialEndsAt = subscription?.trialEndIso ?? computeDerivedTrialEndsAt(startedAt);
    const trialingByDate = isTrialEndInFuture(effectiveTrialEndsAt);
    const trialingByStatus = normalizedSubStatus === 'trialing';
    const trialing = !cancelled && !suspended && (trialingByDate || trialingByStatus || isSubscriptionTrialing(subscription ?? {
      status: null,
      trialEndIso: null,
      cancelledAtIso: null,
      isTrialFlag: false,
    }));

    let subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'suspended' = 'active';
    if (cancelled) {
      subscriptionStatus = 'cancelled';
    } else if (suspended) {
      subscriptionStatus = 'suspended';
    } else if (trialing) {
      subscriptionStatus = 'trialing';
    } else if (normalizedSubStatus === 'past_due' || normalizedSubStatus === 'unpaid') {
      subscriptionStatus = 'past_due';
    } else if (normalizedSubStatus === 'active') {
      subscriptionStatus = 'active';
    }

    const paymentStatus: 'paid' | 'failed' | 'pending' | 'refunded' =
      normalizedSubStatus === 'past_due' || normalizedSubStatus === 'unpaid'
        ? 'failed'
        : normalizedSubStatus === 'active'
          ? 'paid'
          : normalizedSubStatus === 'trialing'
            ? 'pending'
            : 'pending';

    return {
      account_id: b.id,
      account_name: b.name,
      owner_name: owner?.full_name ?? ownerAuth?.user_metadata?.full_name ?? 'Owner',
      owner_email: owner?.email ?? ownerAuth?.email ?? '',
      plan,
      billing_cycle: 'monthly',
      renewal_date: computeNextRenewalIso(startedAt),
      amount_cents: PLAN_MONTHLY_USD_CENTS[plan],
      mrr_cents: subscriptionStatus === 'cancelled' ? 0 : PLAN_MONTHLY_USD_CENTS[plan],
      subscription_status: subscriptionStatus,
      payment_status: paymentStatus,
      failed_payments: null,
      started_at: startedAt,
      trial_end: effectiveTrialEndsAt,
      trial_debug: {
        subscription_table: subscriptionsProbe.table,
        status: subscription?.status ?? null,
        trial_end: effectiveTrialEndsAt,
        trialing_by_date: trialingByDate,
        trialing_by_status: trialingByStatus,
        matched_trial_rule: trialing,
        is_trial: subscription?.isTrialFlag ?? false,
        cancelled_at: subscription?.cancelledAtIso ?? null,
      },
      cancelled_at:
        b.admin_deactivated_at ?? owner?.subscriber_admin_deactivated_at ?? subscription?.cancelledAtIso ?? null,
    };
  });

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_billing',
    metadata: { accounts: accounts.length },
  });

  return NextResponse.json({
    platform_billing: 'zenzex',
    source_of_truth: subscriptionsProbe.table ?? 'no_subscription_table_found',
    accounts,
  });
}
