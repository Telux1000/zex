import type { SupabaseClient } from '@supabase/supabase-js';

export type InternalStaffInviteRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  invited_by: string;
  revoked_at: string | null;
  accepted_at: string | null;
};

function displayInviteStatus(row: InternalStaffInviteRow): 'pending' | 'accepted' | 'expired' | 'revoked' {
  if (row.status === 'revoked' || row.revoked_at) return 'revoked';
  if (row.status === 'accepted') return 'accepted';
  if (row.status === 'expired') return 'expired';
  if (row.status === 'pending' && new Date(row.expires_at).getTime() <= Date.now()) return 'expired';
  return 'pending';
}

export async function loadInternalStaffDirectory(admin: SupabaseClient) {
  const [{ data: staffProfiles, error: staffErr }, { data: inviteRows, error: invErr }, authUsersRes] =
    await Promise.all([
      admin
        .from('profiles')
        .select(
          'id, full_name, email, internal_admin_role, internal_staff_code, internal_admin_suspended_at, internal_admin_invited_by, created_at'
        )
        .not('internal_admin_role', 'is', null)
        .order('created_at', { ascending: false }),
      admin.from('internal_staff_invites').select('*').order('created_at', { ascending: false }).limit(200),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (staffErr) throw new Error(staffErr.message);
  if (invErr) throw new Error(invErr.message);

  const authById = new Map((authUsersRes.data?.users ?? []).map((u) => [String(u.id), u]));

  const inviterIds = new Set<string>();
  for (const p of staffProfiles ?? []) {
    if (p.internal_admin_invited_by) inviterIds.add(String(p.internal_admin_invited_by));
  }
  for (const r of inviteRows ?? []) {
    inviterIds.add(String(r.invited_by));
  }

  const inviterIdList = Array.from(inviterIds);
  const inviterProfilesRes =
    inviterIdList.length > 0
      ? await admin.from('profiles').select('id, full_name, email').in('id', inviterIdList)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };

  const inviterById = new Map(
    (inviterProfilesRes.data ?? []).map((x) => [
      String(x.id),
      { name: (x.full_name && String(x.full_name).trim()) || null, email: x.email ?? null },
    ])
  );

  const staff = (staffProfiles ?? []).map((p) => {
    const role = String(p.internal_admin_role ?? '').toLowerCase();
    const suspended = Boolean(p.internal_admin_suspended_at);
    const inv = p.internal_admin_invited_by ? inviterById.get(String(p.internal_admin_invited_by)) : undefined;
    const auth = authById.get(String(p.id));
    return {
      user_id: p.id,
      full_name: p.full_name ?? '',
      email: p.email ?? '',
      internal_code: p.internal_staff_code ? String(p.internal_staff_code) : null,
      role,
      status: suspended ? ('suspended' as const) : ('active' as const),
      invited_by_email: inv?.email ?? null,
      invited_by_name: inv?.name ?? null,
      created_at: p.created_at,
      last_active_at: auth?.last_sign_in_at ?? null,
      auth_banned_until: auth?.banned_until ?? null,
    };
  });

  const invites = (inviteRows ?? []).map((r) => {
    const row = r as InternalStaffInviteRow;
    const inv = inviterById.get(String(row.invited_by));
    return {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
      status: displayInviteStatus(row),
      invited_by_email: inv?.email ?? null,
      invited_by_name: inv?.name ?? null,
      created_at: row.created_at,
      expires_at: row.expires_at,
      accepted_at: row.accepted_at,
    };
  });

  return { staff, invites, authById };
}
