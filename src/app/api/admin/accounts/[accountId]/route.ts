import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { dbRoleToAdminRole } from '@/lib/admin/account-member-roles';
import {
  deriveAccountLifecycleStatus,
  deriveAccountLifecycle,
  buildAccountLifecycleTimeline,
  deriveMemberUserStatus,
  deriveOwnerUserStatus,
  canManageSubscriberLifecycle,
} from '@/lib/admin/account-lifecycle';
import { requireAdminApiAccess } from '@/lib/admin/auth';
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

  const userIds = [String(business.owner_id), ...(members ?? []).map((m) => String(m.user_id))];
  const uniqueUserIds = Array.from(new Set(userIds));

  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select(
      'id, full_name, email, billing_plan, created_at, onboarding_pricing_completed_at, onboarding_completed_at, subscriber_admin_suspended_at, subscriber_admin_deactivated_at'
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
  const [{ data: recentActivity }, { data: resendRows }] = await Promise.all([
    admin
      .from('activity_events')
      .select('created_at')
      .eq('business_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1),
    ownerProfile?.email
      ? admin
          .from('signup_resend_attempts')
          .select('created_at, outcome')
          .eq('email_normalized', String(ownerProfile.email).trim().toLowerCase())
          .eq('outcome', 'sent')
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const accountLifecycle = deriveAccountLifecycleStatus({
    admin_suspended_at: business.admin_suspended_at,
    admin_deactivated_at: business.admin_deactivated_at,
  });

  const ownerStatus = deriveOwnerUserStatus({
    subscriber_admin_suspended_at: ownerProfile?.subscriber_admin_suspended_at ?? null,
    subscriber_admin_deactivated_at: ownerProfile?.subscriber_admin_deactivated_at ?? null,
    last_sign_in_at: ownerAuth?.last_sign_in_at ?? null,
  });
  const lifecycle = deriveAccountLifecycle({
    created_at: ownerAuth?.created_at ?? ownerProfile?.created_at ?? business.created_at,
    email_verified_at: ownerAuth?.email_confirmed_at ?? null,
    last_sign_in_at: ownerAuth?.last_sign_in_at ?? null,
    onboarding_started_at: ownerProfile?.onboarding_pricing_completed_at ?? ownerProfile?.onboarding_completed_at ?? null,
    onboarding_completed_at: ownerProfile?.onboarding_completed_at ?? null,
  });
  const firstSignInAt =
    ownerAuth?.last_sign_in_at && ownerAuth?.created_at && ownerAuth.last_sign_in_at !== ownerAuth.created_at
      ? ownerAuth.last_sign_in_at
      : ownerAuth?.last_sign_in_at ?? null;
  const verificationEmailSentAt =
    (resendRows?.[0] && typeof resendRows[0].created_at === 'string' ? resendRows[0].created_at : null) ?? null;
  const lifecycleTimeline = buildAccountLifecycleTimeline({
    created_at: ownerAuth?.created_at ?? ownerProfile?.created_at ?? business.created_at,
    verification_email_sent_at: verificationEmailSentAt,
    email_verified_at: ownerAuth?.email_confirmed_at ?? null,
    first_sign_in_at: firstSignInAt,
    onboarding_started_at: lifecycle.onboarding_started_at,
    onboarding_completed_at: lifecycle.onboarding_completed_at,
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
      created_at: business.created_at,
      users_count: users.length,
      owner_lifecycle: {
        lifecycle_state: lifecycle.lifecycle_state,
        needs_attention: lifecycle.needs_attention,
        email_verified_at: lifecycle.email_verified_at,
        last_sign_in_at: lifecycle.last_sign_in_at,
        onboarding_status: lifecycle.onboarding_status,
        onboarding_started_at: lifecycle.onboarding_started_at,
        onboarding_completed_at: lifecycle.onboarding_completed_at,
      },
      lifecycle_timeline: lifecycleTimeline,
      support: {
        can_resend_verification: !lifecycle.email_verified_at && Boolean(ownerProfile?.email),
        onboarding_link: lifecycle.onboarding_completed_at ? null : '/onboarding',
        can_password_reset: true,
        last_activity_at:
          recentActivity?.[0] && typeof recentActivity[0].created_at === 'string' ? recentActivity[0].created_at : null,
      },
    },
    users,
    pending_invites: pendingInvites,
  });
}
