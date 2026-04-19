import { NextResponse } from 'next/server';
import {
  enrichAuditLogActorDisplayRows,
  enrichAuditLogsWithTeamMemberDisplayNames,
  type AuditEntityType,
  type AuditLogRow,
} from '@/lib/audit-log';
import { AUDIT_REMINDER_ACTION_GROUP, buildAuditLogSearchOrClause } from '@/lib/audit-logs-query';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

const ENTITY_TYPES: AuditEntityType[] = ['customer', 'invoice', 'payment', 'team'];
const MAX_PAGE_SIZE = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Subscriber workspace audit log (`audit_logs`) for internal admins.
 * Same rows and shaping as GET /api/audit-logs for the business, without requiring membership.
 */
export async function GET(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { accountId } = await params;
  if (!accountId) return NextResponse.json({ error: 'Missing account id.' }, { status: 400 });

  const { data: business, error: bErr } = await admin.from('businesses').select('id').eq('id', accountId).maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!business) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get('entity_type');
  const actionGroup = searchParams.get('action_group')?.trim() ?? '';
  const action = searchParams.get('action');
  const performedByUserId = searchParams.get('performed_by_user_id');
  const involvingUserId = searchParams.get('involving_user_id')?.trim() ?? '';
  const performedByName = searchParams.get('performed_by_name')?.trim() ?? '';
  const search = searchParams.get('search')?.trim() ?? '';
  const metadataSource = searchParams.get('metadata_source')?.trim() ?? '';
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(searchParams.get('page_size') ?? '25', 10) || 25)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (involvingUserId && !UUID_RE.test(involvingUserId)) {
    return NextResponse.json({ error: 'Invalid involving_user_id.' }, { status: 400 });
  }

  const validMetadataSource = ['', 'user', 'assistant', 'api', 'cron'];
  if (metadataSource && !validMetadataSource.includes(metadataSource)) {
    return NextResponse.json({ error: 'Invalid metadata_source.' }, { status: 400 });
  }

  if (actionGroup && actionGroup !== 'reminders') {
    return NextResponse.json({ error: 'Invalid action_group.' }, { status: 400 });
  }

  let query = admin
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('business_id', accountId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (actionGroup === 'reminders') {
    query = query.in('action', [...AUDIT_REMINDER_ACTION_GROUP]);
  } else {
    if (entityType && ENTITY_TYPES.includes(entityType as AuditEntityType)) {
      query = query.eq('entity_type', entityType);
    }
    if (action) {
      query = query.eq('action', action);
    }
  }

  if (involvingUserId) {
    query = query.or(`performed_by_user_id.eq.${involvingUserId},target_user_id.eq.${involvingUserId}`);
  } else if (performedByUserId) {
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

  if (metadataSource === 'user') {
    query = query.or('metadata->>source.is.null,metadata->>source.eq.manual');
  } else if (metadataSource === 'assistant') {
    query = query.ilike('metadata->>source', '%assistant%');
  } else if (metadataSource === 'api') {
    query = query.eq('metadata->>source', 'api');
  } else if (metadataSource === 'cron') {
    query = query.eq('metadata->>reminder_source', 'cron');
  }

  const searchClause = buildAuditLogSearchOrClause(search);
  if (searchClause) {
    query = query.or(searchClause);
  }

  const { data: logs, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teamEnriched = await enrichAuditLogsWithTeamMemberDisplayNames(admin, (logs ?? []) as AuditLogRow[]);
  const enrichedLogs = await enrichAuditLogActorDisplayRows(admin, teamEnriched, {
    audience: 'internal',
  });

  const logsForClient = enrichedLogs.map((row) => ({
    ...row,
    actorAccountNumber: row.actor_account_number ?? row.actorAccountNumber ?? null,
    targetAccountNumber: row.target_account_number ?? row.targetAccountNumber ?? null,
  }));

  const { count: allCount } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', accountId);

  return NextResponse.json({
    logs: logsForClient,
    total: count ?? 0,
    allTotal: allCount ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  });
}
