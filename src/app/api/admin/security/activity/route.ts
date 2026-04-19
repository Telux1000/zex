import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  actionsForSecurityActivityCategory,
  SECURITY_ACTIVITY_CATEGORIES,
  type SecurityActivityCategory,
} from '@/lib/admin/security-activity-filters';
import {
  enrichAdminAuditLogsForConsole,
  type AdminAuditLogRow,
} from '@/lib/admin/admin-audit-display';

function parsePage(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function parsePageSize(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 50;
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 200);
}

function isCategory(v: string): v is SecurityActivityCategory {
  return (SECURITY_ACTIVITY_CATEGORIES as readonly string[]).includes(v);
}

export async function GET(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const page = parsePage(searchParams.get('page'));
  const pageSize = parsePageSize(searchParams.get('page_size'));
  const search = (searchParams.get('search') ?? '').trim();
  const catRaw = searchParams.get('category') ?? 'all';
  const category = isCategory(catRaw) ? catRaw : 'all';

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from('admin_audit_logs')
    .select('id, actor_user_id, actor_role, action, target_type, target_id, metadata, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, to);

  const actionList = actionsForSecurityActivityCategory(category);
  if (actionList?.length) {
    query = query.in('action', actionList);
  }

  if (search.length > 0) {
    const safe = search.replace(/[^a-zA-Z0-9@._\-:]/g, '').slice(0, 96);
    if (safe.length > 0) {
      const pattern = `%${safe}%`;
      query = query.or(
        `action.ilike.${pattern},target_id.ilike.${pattern},actor_user_id.ilike.${pattern},metadata::text.ilike.${pattern}`
      );
    }
  }

  const { data: logs, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await enrichAdminAuditLogsForConsole(admin, (logs ?? []) as AdminAuditLogRow[]);

  const total = count ?? 0;
  return NextResponse.json({
    logs: enriched,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    category,
  });
}
