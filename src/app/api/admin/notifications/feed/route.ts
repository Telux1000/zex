import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import {
  isExcludedAdminBellAuditAction,
  mapAuditRowToBellItem,
  type AdminBellItem,
} from '@/lib/admin/admin-notification-feed';

const MAX_ROWS = 40;

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase } = gate;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('admin_audit_logs')
    .select('id, action, actor_role, target_type, target_id, metadata, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items: AdminBellItem[] = [];
  for (const raw of rows ?? []) {
    const action = String(raw.action ?? '');
    if (!action || isExcludedAdminBellAuditAction(action)) continue;
    items.push(
      mapAuditRowToBellItem({
        id: String(raw.id),
        action,
        actor_role: String(raw.actor_role ?? ''),
        target_type: raw.target_type != null ? String(raw.target_type) : null,
        target_id: raw.target_id != null ? String(raw.target_id) : null,
        metadata: (raw.metadata ?? null) as Record<string, unknown> | null,
        created_at: String(raw.created_at ?? new Date().toISOString()),
      })
    );
    if (items.length >= MAX_ROWS) break;
  }

  return NextResponse.json({
    items,
    generatedAt: new Date().toISOString(),
  });
}
