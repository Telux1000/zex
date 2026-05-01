import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminRole } from '@/lib/admin/auth';

export type AdminAuditAction =
  | 'admin_view_accounts'
  | 'admin_view_users'
  | 'admin_view_billing'
  | 'admin_view_invoices'
  | 'admin_view_support'
  | 'admin_view_analytics'
  | 'admin_view_security'
  | 'admin_user_suspended'
  | 'admin_user_reactivated'
  | 'admin_ticket_created'
  | 'admin_ticket_status_changed'
  | 'admin_ticket_message_sent'
  | 'admin_ticket_priority_changed'
  | 'admin_ticket_assigned'
  | 'admin_ticket_internal_note_added'
  | 'admin_billing_synced'
  | 'admin_view_team'
  | 'admin_account_suspended'
  | 'admin_account_reactivated'
  | 'admin_account_deactivated'
  | 'admin_subscriber_user_suspended'
  | 'admin_subscriber_user_reactivated'
  | 'admin_subscriber_user_deactivated'
  | 'admin_subscriber_password_reset_sent'
  | 'internal_staff_invite_created'
  | 'internal_staff_invite_resent'
  | 'internal_staff_invite_revoked'
  | 'internal_staff_invite_accepted'
  | 'internal_staff_role_changed'
  | 'internal_staff_deactivated'
  | 'internal_staff_reactivated'
  | 'internal_staff_profile_name_updated'
  | 'internal_security_policy_updated'
  | 'admin_platform_settings_updated'
  | 'admin_signup_invite_created'
  | 'admin_signup_mode_changed'
  | 'admin_system_mode_changed'
  | 'admin_view_waitlist'
  | 'admin_waitlist_invited'
  | 'admin_waitlist_marked_converted';

export async function logAdminAuditEvent(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  actorRole: AdminRole;
  action: AdminAuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const { error } = await params.supabase.from('admin_audit_logs').insert({
    actor_user_id: params.actorUserId,
    actor_role: params.actorRole,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    metadata: params.metadata ?? null,
  });
  if (error) {
    console.error('admin_audit_logs insert failed', error);
  }
}

/** Service-role insert when the actor session cannot yet satisfy RLS (e.g. right after invite acceptance). */
export async function logAdminAuditEventAsService(params: {
  admin: SupabaseClient;
  actorUserId: string;
  actorRole: AdminRole;
  action: AdminAuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const { error } = await params.admin.from('admin_audit_logs').insert({
    actor_user_id: params.actorUserId,
    actor_role: params.actorRole,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    metadata: params.metadata ?? null,
  });
  if (error) {
    console.error('admin_audit_logs service insert failed', error);
  }
}
