import type { SupabaseClient } from '@supabase/supabase-js';

export async function insertTeamAuditLog(params: {
  supabase: SupabaseClient;
  businessId: string;
  entityId: string;
  action:
    | 'user_invited'
    | 'invite_resent'
    | 'invite_revoked'
    | 'role_changed'
    | 'user_suspended'
    | 'user_reactivated'
    | 'user_deactivated'
    | 'password_reset_sent';
  performedByUserId: string;
  performedByName: string;
  actorAccountNumber?: string | null;
  /** Internal staff B-code; when actorKind is internal_admin, subscriber Z-code is not used on the actor. */
  actorInternalCode?: string | null;
  actorKind?: 'internal_admin';
  targetUserId?: string | null;
  targetAccountNumber?: string | null;
  targetNameSnapshot?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const meta: Record<string, unknown> = { ...(params.metadata ?? {}) };
  if (params.actorKind === 'internal_admin') {
    meta.actor_kind = 'internal_admin';
    meta.source = 'internal_admin';
    if (params.actorInternalCode) meta.actor_internal_code = params.actorInternalCode;
  }
  const actorAcct =
    params.actorKind === 'internal_admin' ? null : (params.actorAccountNumber ?? null);

  await params.supabase.from('audit_logs').insert({
    business_id: params.businessId,
    entity_type: 'team',
    entity_id: params.entityId,
    action: params.action,
    performed_by_user_id: params.performedByUserId,
    performed_by_name: params.performedByName,
    actor_account_number: actorAcct,
    target_user_id: params.targetUserId ?? null,
    target_account_number: params.targetAccountNumber ?? null,
    target_name_snapshot: params.targetNameSnapshot ?? null,
    metadata: meta,
  });
}

