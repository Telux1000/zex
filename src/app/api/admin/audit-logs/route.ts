import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { data, error } = await gate.supabase
    .from('admin_audit_logs')
    .select('id, actor_user_id, actor_role, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data ?? [] });
}
