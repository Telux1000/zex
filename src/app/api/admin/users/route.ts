import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { maskEmail, maskText } from '@/lib/admin/privacy';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, billing_plan, created_at')
    .order('created_at', { ascending: false })
    .limit(400);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [authUsersRes, businessesRes, membershipsRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from('businesses').select('id, name, owner_id').limit(1000),
    supabase.from('business_members').select('business_id, user_id').limit(4000),
  ]);
  const { data: authUsers } = authUsersRes;
  if (businessesRes.error) return NextResponse.json({ error: businessesRes.error.message }, { status: 500 });
  if (membershipsRes.error) return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 });

  const authById = new Map((authUsers?.users ?? []).map((u) => [String(u.id), u]));
  const ownedAccountByUserId = new Map((businessesRes.data ?? []).map((b) => [String(b.owner_id), b]));
  const businessNameById = new Map((businessesRes.data ?? []).map((b) => [String(b.id), b.name]));
  const memberBusinessByUserId = new Map<string, string>();
  for (const m of membershipsRes.data ?? []) {
    const userId = String(m.user_id ?? '');
    if (!userId || memberBusinessByUserId.has(userId)) continue;
    memberBusinessByUserId.set(userId, String(m.business_id ?? ''));
  }

  const rows = (profiles ?? []).map((p) => {
    const auth = authById.get(String(p.id));
    const owned = ownedAccountByUserId.get(String(p.id));
    const memberBusinessId = memberBusinessByUserId.get(String(p.id));
    const accountId = owned?.id ?? memberBusinessId ?? null;
    const accountName = owned?.name ?? (memberBusinessId ? businessNameById.get(memberBusinessId) : null) ?? null;
    return {
      id: p.id,
      display_name: maskText(p.full_name),
      email_masked: maskEmail(p.email),
      role: p.role ?? 'owner',
      account_id: accountId,
      account_name: accountName,
      last_sign_in_at: auth?.last_sign_in_at ?? null,
      suspended: Boolean(auth?.banned_until),
    };
  });

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_users',
    metadata: { count: rows.length },
  });

  return NextResponse.json({ users: rows });
}
