import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { dbRoleToAdminRole } from '@/lib/admin/account-member-roles';
import { deriveAccountLifecycleStatus, deriveMemberUserStatus, deriveOwnerUserStatus, canManageSubscriberLifecycle } from '@/lib/admin/account-lifecycle';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import {
  ceilingDaysLeftUntil,
  computeDerivedTrialEndsAt,
  isSubscriptionCancelled,
  isSubscriptionTrialing,
  isTrialEndInFuture,
  normalizeSubscriptionStatus,
  pickLatestSubscriptionByBusiness,
} from '@/lib/admin/billing-subscription-status';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

const AUTH_CHUNK = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { accountId } = await params;
  if (!accountId) return NextResponse.json({ error: 'Missing account id.' }, { status: 400 });

  const { data: business, error: bErr } = await admin
    .from('businesses')
    .select('id, name, owner_id, created_at, admin_suspended_at, admin_deactivated_at')
    .eq('id', accountId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!business) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const [{ data: members, error: mErr }, { data: invites, error: iErr }] = await Promise.all([
    admin
      .from('business_members')
      .select('user_id, role, suspended_at, deactivated_at, created_at')
      .eq('business_id', accountId)
      .order('created_at', { ascending: true }),
    admin
      .from('business_team_invites')
      .select('id, email, role, created_at, expires_at, accepted_at')
      .eq('business_id', accountId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  const { count: customersCount, error: customersErr } = await admin
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', accountId);
  if (customersErr) return NextResponse.json({ error: customersErr.message }, { status: 500 });

  const subscriptionsProbe = await admin.from('subscriptions').select('*').eq('business_id', accountId).limit(500);
  const subscriptionRows =
    subscriptionsProbe.error && subscriptionsProbe.error.code === '42P01'
      ? ((await admin.from('billing_subscriptions').select('*').eq('business_id', accountId).limit(500)).data ??
        []) as Record<string, unknown>[]
      : ((subscriptionsProbe.data ?? []) as Record<string, unknown>[]);

  const userIds = [String(business.owner_id), ...(members ?? []).map((m) => String(m.user_id))];
  const uniqueUserIds = Array.from(new Set(userIds));

  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select(
      'id, full_name, email, billing_plan, subscriber_admin_suspended_at, subscriber_admin_deactivated_at'
    )
    .in('id', uniqueUserIds);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const profileById = new Map((profiles ?? []).map((p) => [String(p.id), p]));

  const authById = new Map<string, User>();
  for (let i = 0; i < uniqueUserIds.length; i += AUTH_CHUNK) {
    const chunk = uniqueUserIds.slice(i, i + AUTH_CHUNK);
    const results = await Promise.all(chunk.map((id) => admin.auth.admin.getUserById(id)));
    results.forEach((res, j) => {
      const u = res.data?.user;
      if (u) authById.set(chunk[j], u);
    });
  }

  const ownerProfile = profileById.get(String(business.owner_id));
  const ownerAuth = authById.get(String(business.owner_id));

  const accountLifecycle = deriveAccountLifecycleStatus({
    admin_suspended_at: business.admin_suspended_at,
    admin_deactivated_at: business.admin_deactivated_at,
  });
  const subscriptionsByBusiness = pickLatestSubscriptionByBusiness(subscriptionRows);
  const subscriptionSnapshot = subscriptionsByBusiness.get(String(business.id)) ?? null;
  const cancelled = Boolean(
    business.admin_deactivated_at ||
      ownerProfile?.subscriber_admin_deactivated_at ||
      (subscriptionSnapshot ? isSubscriptionCancelled(subscriptionSnapshot) : false)
  );
  const suspended = Boolean(business.admin_suspended_at || ownerProfile?.subscriber_admin_suspended_at);
  const trialEnd = subscriptionSnapshot?.trialEndIso ?? computeDerivedTrialEndsAt(ownerAuth?.created_at ?? business.created_at);
  const trialFromDate = isTrialEndInFuture(trialEnd);
  const trialFromStatus = normalizeSubscriptionStatus(subscriptionSnapshot?.status ?? null) === 'trialing';
  const trialFromSubscription =
    !cancelled &&
    !suspended &&
    (trialFromDate ||
      trialFromStatus ||
      (subscriptionSnapshot ? isSubscriptionTrialing(subscriptionSnapshot) : false));
  const statusDaysLeft =
    accountLifecycle === 'active' && !suspended
      ? trialFromSubscription
        ? ceilingDaysLeftUntil(trialEnd)
        : ceilingDaysLeftUntil(subscriptionSnapshot?.currentPeriodEndIso ?? null)
      : null;

  const ownerStatus = deriveOwnerUserStatus({
    subscriber_admin_suspended_at: ownerProfile?.subscriber_admin_suspended_at ?? null,
    subscriber_admin_deactivated_at: ownerProfile?.subscriber_admin_deactivated_at ?? null,
    last_sign_in_at: ownerAuth?.last_sign_in_at ?? null,
  });

  const users = [
    {
      id: String(business.owner_id),
      name: ownerProfile?.full_name ?? 'Owner',
      email: ownerProfile?.email ?? ownerAuth?.email ?? '',
      role: 'owner' as const,
      status: ownerStatus,
      created_at: ownerAuth?.created_at ?? business.created_at,
      last_active_at: ownerAuth?.last_sign_in_at ?? null,
    },
    ...(members ?? []).map((m) => {
      const p = profileById.get(String(m.user_id));
      const a = authById.get(String(m.user_id));
      const role = dbRoleToAdminRole(String(m.role));
      const status = deriveMemberUserStatus({
        suspended_at: m.suspended_at,
        deactivated_at: m.deactivated_at,
        last_sign_in_at: a?.last_sign_in_at ?? null,
      });
      return {
        id: String(m.user_id),
        name: p?.full_name ?? 'User',
        email: p?.email ?? a?.email ?? '',
        role,
        status,
        created_at: a?.created_at ?? m.created_at,
        last_active_at: a?.last_sign_in_at ?? null,
      };
    }),
  ];

  const pendingInvites = (invites ?? []).map((i) => {
    const exp = new Date(String(i.expires_at)).getTime();
    const expired = exp <= Date.now();
    return {
      id: String(i.id),
      email: String(i.email),
      role: dbRoleToAdminRole(String(i.role)),
      status: expired ? ('pending' as const) : ('invited' as const),
      created_at: String(i.created_at),
      expires_at: String(i.expires_at),
    };
  });

  return NextResponse.json({
    actor: {
      role: gate.adminRole,
      canManageLifecycle: canManageSubscriberLifecycle(gate.adminRole),
    },
    account: {
      id: business.id,
      name: business.name,
      owner: {
        id: String(business.owner_id),
        name: ownerProfile?.full_name ?? 'Owner',
        email: ownerProfile?.email ?? ownerAuth?.email ?? '',
      },
      plan: ownerProfile?.billing_plan ?? 'starter',
      lifecycle_status: accountLifecycle,
      trial_status: trialFromSubscription ? 'in_trial' : 'trial_ended',
      status_days_left: statusDaysLeft,
      created_at: business.created_at,
      users_count: users.length,
      customers_count: Number(customersCount ?? 0),
    },
    users,
    pending_invites: pendingInvites,
  });
}
