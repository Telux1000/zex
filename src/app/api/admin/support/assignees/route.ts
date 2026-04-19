import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

/** Internal staff eligible for ticket assignment (active). */
export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, email, internal_admin_role')
    .in('internal_admin_role', ['owner', 'admin', 'support'])
    .is('internal_admin_suspended_at', null)
    .order('full_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const assignees = (data ?? []).map((r) => ({
    id: String(r.id),
    full_name: r.full_name ? String(r.full_name).trim() : null,
    email: r.email ? String(r.email).trim() : null,
    role: r.internal_admin_role ? String(r.internal_admin_role) : null,
  }));

  return NextResponse.json({ assignees });
}
