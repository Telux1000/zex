import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

/** Businesses for support queue account filter (bounded list). */
export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data, error } = await admin
    .from('businesses')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const accounts = (data ?? []).map((b) => ({
    id: String(b.id),
    name: String(b.name ?? '').trim() || 'Untitled',
  }));

  return NextResponse.json({ accounts });
}
