import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  enrichAuditLogActorDisplayRows,
  enrichAuditLogsWithTeamMemberDisplayNames,
  type AuditEntityType,
  type AuditLogRow,
} from '@/lib/audit-log';
import { buildAuditLogSearchOrClause } from '@/lib/audit-logs-query';

const ENTITY_TYPES: AuditEntityType[] = ['customer', 'invoice', 'payment', 'team'];
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
  }

  const { data: business } = await supabase.from('businesses').select('id').eq('id', businessId).single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const entityType = searchParams.get('entity_type');
  const action = searchParams.get('action');
  const performedByUserId = searchParams.get('performed_by_user_id');
  const performedByName = searchParams.get('performed_by_name')?.trim() ?? '';
  const search = searchParams.get('search')?.trim() ?? '';
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(searchParams.get('page_size') ?? '25', 10) || 25)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (entityType && ENTITY_TYPES.includes(entityType as AuditEntityType)) {
    query = query.eq('entity_type', entityType);
  }
  if (action) {
    query = query.eq('action', action);
  }
  if (performedByUserId) {
    query = query.eq('performed_by_user_id', performedByUserId);
  } else if (performedByName) {
    query = query.eq('performed_by_name', performedByName);
  }
  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);
  }
  const searchClause = buildAuditLogSearchOrClause(search);
  if (searchClause) {
    query = query.or(searchClause);
  }

  const { data: logs, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teamEnriched = await enrichAuditLogsWithTeamMemberDisplayNames(
    supabase,
    (logs ?? []) as AuditLogRow[]
  );
  const enrichedLogs = await enrichAuditLogActorDisplayRows(supabase, teamEnriched);

  const logsForClient = enrichedLogs.map((row) => ({
    ...row,
    actorAccountNumber: row.actor_account_number ?? row.actorAccountNumber ?? null,
    targetAccountNumber: row.target_account_number ?? row.targetAccountNumber ?? null,
  }));

  const { count: allCount } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);

  const { data: actorIdRows } = await supabase
    .from('audit_logs')
    .select('performed_by_user_id')
    .eq('business_id', businessId)
    .not('performed_by_user_id', 'is', null)
    .limit(3000);

  const uniqueActorIds = Array.from(
    new Set((actorIdRows ?? []).map((r) => String((r as { performed_by_user_id: string }).performed_by_user_id)))
  );

  const actorOptions: { userId: string | null; label: string }[] = [];
  if (uniqueActorIds.length) {
    const { data: actorProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', uniqueActorIds);
    for (const p of actorProfiles ?? []) {
      const id = String((p as { id: string }).id);
      const full = String((p as { full_name?: string | null }).full_name ?? '').trim();
      const email = String((p as { email?: string | null }).email ?? '').trim();
      const label = full || email || id;
      actorOptions.push({ userId: id, label });
    }
    actorOptions.sort((a, b) => a.label.localeCompare(b.label));
  }

  return NextResponse.json({
    logs: logsForClient,
    actorOptions,
    total: count ?? 0,
    allTotal: allCount ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  });
}
