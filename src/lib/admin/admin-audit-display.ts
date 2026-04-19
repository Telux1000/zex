import type { SupabaseClient } from '@supabase/supabase-js';
import { adminAuditTargetDescription } from '@/lib/admin/admin-audit-target-display';

export type AdminAuditLogRow = {
  id: string;
  actor_user_id: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata?: unknown;
  created_at: string;
};

export type EnrichedAdminAuditLogRow = AdminAuditLogRow & {
  actor_display: string;
  action_label: string;
  /** Pre-resolved target line (subscriber_user rows may merge live profile + business). */
  target_display: string;
};

/** e.g. B001 Mark Alien (code + display name; no parentheses). */
export function formatAdminConsoleActorDisplay(profile: {
  internal_staff_code: string | null | undefined;
  full_name: string | null | undefined;
  email: string | null | undefined;
}): string {
  const code = String(profile.internal_staff_code ?? '').trim();
  const full = String(profile.full_name ?? '').trim();
  const email = String(profile.email ?? '').trim();
  const name = full || email || 'Unknown user';
  if (code) return `${code} ${name}`;
  return name;
}

const EXPLICIT_ACTION_LABELS: Record<string, string> = {
  admin_billing_synced: 'Billing synced',
  admin_user_suspended: 'User suspended',
  admin_user_reactivated: 'User reactivated',
  admin_account_suspended: 'Subscriber account suspended',
  admin_account_reactivated: 'Subscriber account reactivated',
  admin_account_deactivated: 'Subscriber account deactivated',
  admin_subscriber_user_suspended: 'Subscriber workspace user suspended',
  admin_subscriber_user_reactivated: 'Subscriber workspace user reactivated',
  admin_subscriber_user_deactivated: 'Subscriber workspace user deactivated',
  admin_subscriber_password_reset_sent: 'Subscriber password reset sent',
  internal_staff_invite_created: 'Internal staff invite created',
  internal_staff_invite_resent: 'Internal staff invite resent',
  internal_staff_invite_revoked: 'Internal staff invite revoked',
  internal_staff_invite_accepted: 'Internal staff invite accepted',
  internal_staff_role_changed: 'Internal staff role changed',
  internal_staff_deactivated: 'Internal staff member deactivated',
  internal_staff_reactivated: 'Internal staff member reactivated',
  internal_staff_profile_name_updated: 'Internal staff profile name updated',
  internal_security_policy_updated: 'Security policy updated',
  admin_platform_settings_updated: 'Platform settings updated',
  admin_ticket_created: 'Support ticket created',
  admin_ticket_status_changed: 'Support ticket status changed',
  admin_ticket_message_sent: 'Support ticket message sent',
  admin_ticket_priority_changed: 'Support ticket priority changed',
  admin_ticket_assigned: 'Support ticket assigned',
  admin_ticket_internal_note_added: 'Support ticket internal note added',
};

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function fallbackActionLabel(action: string): string {
  return titleCaseWords(action.replace(/_/g, ' '));
}

/** Human-readable action for the admin security console (e.g. "Admin view security"). */
export function labelAdminAuditAction(action: string): string {
  if (action.startsWith('admin_view_')) {
    const rest = action.slice('admin_view_'.length).replace(/_/g, ' ');
    return `Admin view ${rest}`;
  }
  return EXPLICIT_ACTION_LABELS[action] ?? fallbackActionLabel(action);
}

export async function enrichAdminAuditLogsForConsole(
  admin: SupabaseClient,
  logs: AdminAuditLogRow[] | null | undefined
): Promise<EnrichedAdminAuditLogRow[]> {
  const list = logs ?? [];
  if (!list.length) return [];

  const ids = Array.from(new Set(list.map((l) => String(l.actor_user_id)).filter(Boolean)));
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, email, internal_staff_code')
    .in('id', ids);

  const byId = new Map<
    string,
    { full_name: string | null; email: string | null; internal_staff_code: string | null }
  >();
  for (const p of profiles ?? []) {
    const id = String((p as { id: string }).id);
    byId.set(id, {
      full_name: (p as { full_name?: string | null }).full_name ?? null,
      email: (p as { email?: string | null }).email ?? null,
      internal_staff_code: (p as { internal_staff_code?: string | null }).internal_staff_code ?? null,
    });
  }

  const subscriberTargetIds = list
    .filter((l) => l.target_type === 'subscriber_user' && l.target_id)
    .map((l) => String(l.target_id));
  const internalStaffProfileTargetIds = list
    .filter((l) => l.target_type === 'internal_staff_profile' && l.target_id)
    .map((l) => String(l.target_id));
  const targetResolutionIds = Array.from(new Set([...subscriberTargetIds, ...internalStaffProfileTargetIds]));

  const { data: targetProfiles } =
    targetResolutionIds.length > 0
      ? await admin
          .from('profiles')
          .select('id, full_name, email, account_number, internal_staff_code')
          .in('id', targetResolutionIds)
      : {
          data: [] as {
            id: string;
            full_name: string | null;
            email: string | null;
            account_number: string | null;
            internal_staff_code: string | null;
          }[],
        };

  const targetProfById = new Map<
    string,
    {
      full_name: string | null;
      email: string | null;
      account_number: string | null;
      internal_staff_code: string | null;
    }
  >();
  for (const p of targetProfiles ?? []) {
    const id = String((p as { id: string }).id);
    targetProfById.set(id, {
      full_name: (p as { full_name?: string | null }).full_name ?? null,
      email: (p as { email?: string | null }).email ?? null,
      account_number: (p as { account_number?: string | null }).account_number ?? null,
      internal_staff_code: (p as { internal_staff_code?: string | null }).internal_staff_code ?? null,
    });
  }

  const accountIdsFromMeta = Array.from(
    new Set(
      list
        .filter((l) => l.target_type === 'subscriber_user')
        .map((l) => {
          const m = l.metadata as { accountId?: string | null } | null | undefined;
          const id = m?.accountId ? String(m.accountId).trim() : '';
          return id;
        })
        .filter(Boolean)
    )
  );
  const { data: businesses } =
    accountIdsFromMeta.length > 0
      ? await admin.from('businesses').select('id, name').in('id', accountIdsFromMeta)
      : { data: [] as { id: string; name: string | null }[] };
  const bizNameById = new Map<string, string>();
  for (const b of businesses ?? []) {
    bizNameById.set(String((b as { id: string }).id), String((b as { name?: string | null }).name ?? '').trim());
  }

  return list.map((log) => {
    const prof = byId.get(String(log.actor_user_id));
    const actor_display = prof
      ? formatAdminConsoleActorDisplay(prof)
      : `Unknown actor (${String(log.actor_user_id).slice(0, 8)}…)`;

    let metadataForTarget = log.metadata;
    if (log.target_type === 'subscriber_user' && log.target_id) {
      const m = { ...((log.metadata ?? {}) as Record<string, unknown>) };
      const tp = targetProfById.get(String(log.target_id));
      if (tp) {
        if (!String(m.targetAccountNumber ?? '').trim() && tp.account_number) {
          m.targetAccountNumber = String(tp.account_number).trim();
        }
        if (!String(m.targetName ?? '').trim() && tp.full_name) {
          m.targetName = tp.full_name;
        }
        if (!String(m.targetEmail ?? '').trim() && tp.email) {
          m.targetEmail = tp.email;
        }
      }
      const aid = String(m.accountId ?? '').trim();
      if (aid && !String(m.accountName ?? '').trim()) {
        const n = bizNameById.get(aid);
        if (n) m.accountName = n;
      }
      metadataForTarget = m;
    }

    if (log.target_type === 'internal_staff_profile' && log.target_id) {
      const m = { ...((log.metadata ?? {}) as Record<string, unknown>) };
      const tp = targetProfById.get(String(log.target_id));
      if (tp) {
        if (!String(m.targetStaffCode ?? '').trim() && tp.internal_staff_code) {
          m.targetStaffCode = String(tp.internal_staff_code).trim();
        }
        if (!String(m.newFullName ?? '').trim() && tp.full_name) {
          m.newFullName = tp.full_name;
        }
        if (!String(m.targetEmail ?? '').trim() && tp.email) {
          m.targetEmail = tp.email;
        }
      }
      metadataForTarget = m;
    }

    const target_display = adminAuditTargetDescription({
      target_type: log.target_type,
      target_id: log.target_id,
      metadata: metadataForTarget,
    });

    return {
      ...log,
      actor_display,
      action_label: labelAdminAuditAction(log.action),
      target_display,
    };
  });
}
