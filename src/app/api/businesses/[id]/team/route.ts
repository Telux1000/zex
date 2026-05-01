import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import type { BusinessRole } from '@/lib/rbac/types';
import { ownerHasTeamInvitesEntitlement } from '@/lib/billing/team-plan-gate.server';

type TeamMemberRow = {
  user_id: string;
  account_number: string;
  accountNumber: string;
  full_name: string | null;
  fullName: string | null;
  email: string | null;
  role: BusinessRole;
  status: 'active' | 'suspended';
  invited_at: string | null;
  joined_at: string | null;
  last_active_at: string | null;
};

function accountNumberFromProfileRow(p: { account_number?: unknown } | null | undefined): string {
  const raw = p?.account_number;
  const s = raw != null ? String(raw).trim() : '';
  return s;
}

type PendingInviteRow = {
  id: string;
  email: string;
  role: string;
  status: 'pending_invite';
  invited_at: string;
  expires_at: string;
  inviter_name: string | null;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId } = await params;
  const gate = await assertBusinessPermission(supabase, businessId, user.id, 'view_data');
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });
  }

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .single();
  if (bizErr || !biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: members, error: memErr } = await admin
    .from('business_members')
    .select('user_id, role, created_at, suspended_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

  const { data: invites, error: invErr } = await admin
    .from('business_team_invites')
    .select('id, email, role, created_at, expires_at, accepted_at, invited_by')
    .eq('business_id', businessId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  const profileIds = [
    String(biz.owner_id),
    ...(members ?? []).map((m) => String(m.user_id)),
    ...(invites ?? []).map((i) => String(i.invited_by)),
  ];
  const uniqueIds = Array.from(new Set(profileIds));

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('*')
    .in('id', uniqueIds);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
  const profileById = new Map((profiles ?? []).map((p) => [String((p as { id: string }).id), p]));

  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authById = new Map((authUsers?.users ?? []).map((u) => [String(u.id), u]));

  const ownerProfile = profileById.get(String(biz.owner_id));
  const ownerAuth = authById.get(String(biz.owner_id));

  const ownerAcct = accountNumberFromProfileRow(ownerProfile as { account_number?: unknown } | null);
  const ownerRow: TeamMemberRow = {
    user_id: String(biz.owner_id),
    account_number: ownerAcct,
    accountNumber: ownerAcct,
    full_name: ownerProfile?.full_name ?? null,
    fullName: ownerProfile?.full_name ?? null,
    email: ownerProfile?.email ?? ownerAuth?.email ?? null,
    role: 'owner',
    status: 'active',
    invited_at: ownerAuth?.invited_at ?? null,
    joined_at: ownerAuth?.confirmed_at ?? ownerAuth?.created_at ?? null,
    last_active_at: ownerAuth?.last_sign_in_at ?? null,
  };

  const memberRows: TeamMemberRow[] = (members ?? []).map((m) => {
    const p = profileById.get(String(m.user_id));
    const au = authById.get(String(m.user_id));
    const acct = accountNumberFromProfileRow(p as { account_number?: unknown } | null | undefined);
    return {
      user_id: String(m.user_id),
      account_number: acct,
      accountNumber: acct,
      full_name: p?.full_name ?? null,
      fullName: p?.full_name ?? null,
      email: p?.email ?? au?.email ?? null,
      role: m.role as BusinessRole,
      status: m.suspended_at ? 'suspended' : 'active',
      invited_at: au?.invited_at ?? null,
      joined_at: au?.confirmed_at ?? au?.created_at ?? null,
      last_active_at: au?.last_sign_in_at ?? null,
    };
  });

  const nowMs = Date.now();
  const pendingInvites: PendingInviteRow[] = (invites ?? [])
    .filter((i) => new Date(String(i.expires_at)).getTime() > nowMs)
    .map((i) => {
      const inviterProfile = profileById.get(String(i.invited_by));
      return {
        id: String(i.id),
        email: String(i.email),
        role: String(i.role),
        status: 'pending_invite',
        invited_at: String(i.created_at),
        expires_at: String(i.expires_at),
        inviter_name: inviterProfile?.full_name ?? null,
      };
    });

  return NextResponse.json({
    current_user_id: user.id,
    current_user_role: gate.role,
    owner: ownerRow,
    members: memberRows,
    pending_invites: pendingInvites,
    entitlements: {
      team_invites: ownerHasTeamInvitesEntitlement(
        (ownerProfile as { billing_plan?: unknown } | null | undefined)?.billing_plan
      ),
    },
  });
}

