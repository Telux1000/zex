import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatAuditActorDisplay,
  type AuditActorAudience,
  type FormatAuditActorOptions,
  resolveAuditActorKind,
  SUBSCRIBER_FACING_INTERNAL_ADMIN_LABEL,
} from '@/lib/audit/actor-format';

export {
  isInternalAdminAuditActor,
  SUBSCRIBER_FACING_INTERNAL_ADMIN_LABEL,
  resolveAuditActorKind,
  type AuditActorKind,
  type FormatAuditActorOptions,
} from '@/lib/audit/actor-format';

export type AuditEntityType = 'customer' | 'invoice' | 'payment' | 'team';

/** How the change was initiated (stored on audit `metadata.source`). */
export type InvoiceMutationSource = 'assistant' | 'manual' | 'api';

/** Appended to human-readable audit lines when `metadata.source` is set. */
export function formatAuditSourceSuffix(meta: Record<string, unknown>): string {
  const s = String(meta.source ?? '').trim().toLowerCase();
  if (s === 'assistant') return ' via Assistant';
  if (s === 'api') return ' via API';
  return '';
}

export type AuditAction =
  | 'created'
  | 'updated'
  | 'edited'
  | 'sent'
  | 'resent'
  | 'reminder_sent'
  | 'auto_reminders_enabled'
  | 'auto_reminders_updated'
  | 'auto_reminders_disabled'
  | 'marked_paid'
  | 'partially_paid'
  | 'voided'
  | 'deleted'
  | 'duplicated'
  | 'payment_recorded'
  | 'refund_initiated'
  | 'refund_partial_initiated'
  | 'refund_completed'
  | 'refund_failed'
  | 'payment_plan_created'
  | 'payment_plan_updated'
  | 'user_invited'
  | 'invite_resent'
  | 'invite_revoked'
  | 'role_changed'
  | 'user_suspended'
  | 'user_reactivated'
  | 'user_deactivated'
  | 'password_reset_sent';

export type AuditLogRow = {
  id: string;
  business_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction | string;
  performed_by_user_id: string | null;
  performed_by_name: string;
  actor_account_number?: string | null;
  actorAccountNumber?: string | null;
  target_user_id?: string | null;
  target_account_number?: string | null;
  targetAccountNumber?: string | null;
  target_name_snapshot?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  /**
   * Enriched by {@link enrichAuditLogActorDisplayRows} for client UIs: `profiles.full_name` first,
   * then email, then `performed_by_name`. Internal admin rows use "Admin Back Office" (no email).
   */
  actor_display_label?: string | null;
  /** Optional tooltip: "Full name · email" for workspace actors; null for internal back-office rows. */
  actor_display_tooltip?: string | null;
  actor_source_label?: 'Back Office' | 'Workspace';
};

export type LogAuditEventInput = {
  businessId: string;
  entityType: 'customer' | 'invoice' | 'payment';
  entityId: string;
  action: AuditAction;
  performedByUserId: string | null;
  performedByName: string;
  /** Stored as actor_account_number */
  actorAccountNumber?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isAuditLogsMissingError(err: unknown): boolean {
  const maybe = err as { message?: string; details?: string; hint?: string };
  const combined = `${String(maybe?.message ?? '')} ${String(maybe?.details ?? '')} ${String(maybe?.hint ?? '')}`
    .toLowerCase();
  return (
    combined.includes('audit_logs') &&
    (combined.includes('does not exist') ||
      combined.includes('could not find') ||
      (combined.includes('schema cache') && combined.includes('audit_logs')))
  );
}

/** Prefer profile full name, then email local part / email (for activity labels). */
export function profileDisplayNameFromProfileRow(
  row: { full_name?: string | null; email?: string | null } | null | undefined
): string | undefined {
  if (!row) return undefined;
  const full = String(row.full_name ?? '').trim();
  if (full) return full;
  const email = String(row.email ?? '').trim();
  if (email) {
    const local = email.split('@')[0];
    return local || email;
  }
  return undefined;
}

export async function resolveActorDisplayName(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();
  const label = profileDisplayNameFromProfileRow(
    data as { full_name?: string | null; email?: string | null } | null
  );
  if (label) return label;
  return data ? 'User' : null;
}

/** Immutable audit row — call only after the triggering action succeeds. */
export async function logAuditEvent(
  supabase: SupabaseClient,
  input: LogAuditEventInput
): Promise<void> {
  let actorAcct = input.actorAccountNumber;
  if ((actorAcct === undefined || actorAcct === '') && input.performedByUserId) {
    const { data } = await supabase
      .from('profiles')
      .select('account_number')
      .eq('id', input.performedByUserId)
      .maybeSingle();
    const n = data && 'account_number' in data ? String((data as { account_number?: string | null }).account_number ?? '').trim() : '';
    actorAcct = n || null;
  }
  const { error } = await supabase.from('audit_logs').insert({
    business_id: input.businessId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    performed_by_user_id: input.performedByUserId,
    performed_by_name: input.performedByName,
    actor_account_number: actorAcct ?? null,
    metadata: input.metadata ?? null,
  });
  if (error && !isAuditLogsMissingError(error)) {
    console.error('audit_logs insert failed', error);
  }
}

/** Alias for integrations that expect `logEvent`. */
export const logEvent = logAuditEvent;

function strMeta(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (v != null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

const TEAM_MEMBER_TARGET_ACTIONS = new Set([
  'password_reset_sent',
  'user_suspended',
  'user_reactivated',
  'user_deactivated',
  'role_changed',
]);

/** Fills metadata from profiles when team member logs lack a stored full name / label. */
export async function enrichAuditLogsWithTeamMemberDisplayNames(
  supabase: SupabaseClient,
  logs: AuditLogRow[]
): Promise<AuditLogRow[]> {
  if (!logs.length) return logs;

  const userIds = new Set<string>();
  for (const row of logs) {
    if (row.entity_type !== 'team') continue;
    if (!TEAM_MEMBER_TARGET_ACTIONS.has(String(row.action))) continue;
    if (String(row.target_name_snapshot ?? '').trim()) continue;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (strMeta(meta, 'full_name', 'targetName', 'target_name', 'target_display_name', 'member_name')) continue;
    const uid = String(meta.targetUserId ?? row.entity_id ?? '').trim();
    if (uid) userIds.add(uid);
  }

  if (!userIds.size) return logs;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', Array.from(userIds));

  const fullById = new Map<string, string>();
  const fallbackById = new Map<string, string>();
  for (const p of profiles ?? []) {
    const id = String((p as { id: string }).id);
    const row = p as { full_name?: string | null; email?: string | null };
    const full = String(row.full_name ?? '').trim();
    if (full) fullById.set(id, full);
    const label = profileDisplayNameFromProfileRow(row);
    if (label) fallbackById.set(id, label);
  }

  return logs.map((row) => {
    if (row.entity_type !== 'team') return row;
    if (!TEAM_MEMBER_TARGET_ACTIONS.has(String(row.action))) return row;
    if (String(row.target_name_snapshot ?? '').trim()) return row;
    const meta = { ...((row.metadata ?? {}) as Record<string, unknown>) };
    if (strMeta(meta, 'full_name', 'targetName', 'target_name', 'target_display_name', 'member_name')) return row;
    const uid = String(meta.targetUserId ?? row.entity_id ?? '').trim();
    if (!uid) return row;
    const full = fullById.get(uid);
    const label = full ?? fallbackById.get(uid);
    if (!label) return row;
    const nextMeta: Record<string, unknown> = { ...meta, target_name: label };
    if (full) nextMeta.full_name = full;
    return { ...row, metadata: nextMeta };
  });
}

/**
 * Resolve User / Source column labels from `profiles` (canonical `full_name`) for subscriber-facing audit tables.
 * Call after {@link enrichAuditLogsWithTeamMemberDisplayNames} when enriching API responses.
 */
export async function enrichAuditLogActorDisplayRows(
  supabase: SupabaseClient,
  rows: AuditLogRow[],
  options?: { audience?: AuditActorAudience }
): Promise<AuditLogRow[]> {
  if (!rows.length) return rows;

  const userIds = Array.from(new Set(rows.map((r) => r.performed_by_user_id).filter(Boolean))) as string[];
  const profileById = new Map<
    string,
    { full_name: string | null; email: string | null; internal_staff_code: string | null }
  >();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, internal_staff_code')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      const id = String((p as { id: string }).id);
      profileById.set(id, {
        full_name: (p as { full_name?: string | null }).full_name ?? null,
        email: (p as { email?: string | null }).email ?? null,
        internal_staff_code: (p as { internal_staff_code?: string | null }).internal_staff_code ?? null,
      });
    }
  }

  return rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const kind = resolveAuditActorKind(meta);

    if (kind === 'internal_admin') {
      const audience = options?.audience ?? 'subscriber';
      const uid = row.performed_by_user_id;
      const prof = uid ? profileById.get(String(uid)) : undefined;
      const fallback = String(row.performed_by_name ?? '').trim();
      const full = prof?.full_name?.trim() || '';
      const email = prof?.email?.trim() || '';
      const code = prof?.internal_staff_code?.trim() || '';

      if (audience === 'internal') {
        const label = full || email || fallback || SUBSCRIBER_FACING_INTERNAL_ADMIN_LABEL;
        const tooltip = full && email ? `${full} · ${email}` : null;
        const nextMeta: Record<string, unknown> = { ...meta };
        if (!String(nextMeta.actor_internal_code ?? '').trim() && code) {
          nextMeta.actor_internal_code = code;
        }
        return {
          ...row,
          performed_by_name: label,
          metadata: nextMeta,
          actor_display_label: label,
          actor_display_tooltip: tooltip,
          actor_source_label: 'Back Office' as const,
        };
      }

      return {
        ...row,
        actor_display_label: SUBSCRIBER_FACING_INTERNAL_ADMIN_LABEL,
        actor_display_tooltip: null,
        actor_source_label: 'Back Office' as const,
      };
    }

    if (kind === 'system') {
      return {
        ...row,
        actor_display_label: 'System',
        actor_display_tooltip: null,
        actor_source_label: 'Workspace' as const,
      };
    }

    const uid = row.performed_by_user_id;
    const prof = uid ? profileById.get(String(uid)) : undefined;
    const fallback = String(row.performed_by_name ?? '').trim();
    const full = prof?.full_name?.trim() || '';
    const email = prof?.email?.trim() || '';
    const label = full || email || fallback || 'Someone';

    let tooltip: string | null = null;
    if (full && email) tooltip = `${full} · ${email}`;

    return {
      ...row,
      actor_display_label: label,
      actor_display_tooltip: tooltip,
      actor_source_label: 'Workspace' as const,
    };
  });
}

function humanizeRole(role: string): string {
  const r = role.trim().toLowerCase();
  const map: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    accountant: 'Accountant',
    staff: 'Staff',
    viewer: 'Viewer',
  };
  return map[r] ?? (r ? r.charAt(0).toUpperCase() + r.slice(1) : role);
}

/** Display name for a team *member* row (password, suspend, role, etc.). Prefer profile full_name in metadata. */
function teamAccountTargetDisplay(meta: Record<string, unknown>): string {
  const named = strMeta(meta, 'full_name', 'targetName', 'target_name', 'target_display_name', 'member_name');
  if (named) return named;
  return 'Unknown user';
}

export type AuditLogFormatOptions = {
  /**
   * `subscriber` (default): workspace-facing UI; internal admin actors show as "Admin Back Office" without personal names/emails.
   * `internal`: admin/back-office UI; internal staff default to `(B###) full name` unless overridden.
   */
  audience?: AuditActorAudience;
  /** See {@link FormatAuditActorOptions.internalStaffActorStyle}. */
  internalStaffActorStyle?: FormatAuditActorOptions['internalStaffActorStyle'];
};

function teamTargetDisplay(
  row: Pick<
    AuditLogRow,
    'target_name_snapshot' | 'target_account_number' | 'targetAccountNumber'
  >,
  meta: Record<string, unknown>
): string {
  const snap = row.target_name_snapshot?.trim();
  const num = String(row.target_account_number ?? row.targetAccountNumber ?? '').trim();
  const fallbackName = teamAccountTargetDisplay(meta);
  const name = snap || fallbackName;
  return num ? `(${num}) ${name}` : name;
}

/**
 * Human-readable sentence for an audit log row (no raw action keys in output).
 */
export function formatAuditLog(
  row: Pick<
    AuditLogRow,
    | 'action'
    | 'entity_type'
    | 'metadata'
    | 'performed_by_name'
    | 'actor_account_number'
    | 'actorAccountNumber'
    | 'target_account_number'
    | 'targetAccountNumber'
    | 'target_name_snapshot'
  >,
  options?: AuditLogFormatOptions
): string {
  const audience = options?.audience ?? 'subscriber';
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const actor = formatAuditActorDisplay(row, meta, audience, {
    internalStaffActorStyle: options?.internalStaffActorStyle,
  });
  const action = String(row.action ?? '');

  if (row.entity_type === 'team') {
    const target = teamTargetDisplay(row, meta);
    switch (action) {
      case 'password_reset_sent':
        return `${actor} sent password reset to ${target}`;
      case 'user_suspended':
        return `${actor} suspended ${target} account`;
      case 'user_reactivated':
        return `${actor} reactivated ${target} account`;
      case 'user_deactivated':
        return `${actor} deactivated ${target} account`;
      case 'role_changed': {
        const from = strMeta(meta, 'fromRole');
        const to = strMeta(meta, 'toRole');
        if (from && to) {
          return `${actor} changed ${target} role from ${humanizeRole(from)} to ${humanizeRole(to)}`;
        }
        return `${actor} changed ${target} role`;
      }
      case 'user_invited': {
        const inviteTarget = strMeta(meta, 'targetName', 'target_name', 'email');
        const role = strMeta(meta, 'role');
        if (inviteTarget && role) return `${actor} invited ${inviteTarget} as ${humanizeRole(role)}`;
        if (inviteTarget) return `${actor} invited ${inviteTarget}`;
        return `${actor} sent a team invitation`;
      }
      case 'invite_resent': {
        const email = strMeta(meta, 'email') ?? 'Unknown user';
        return `${actor} resent the invitation to ${email}`;
      }
      case 'invite_revoked': {
        const email = strMeta(meta, 'email') ?? 'Unknown user';
        return `${actor} revoked the invitation for ${email}`;
      }
      default:
        return `${actor} performed an action`;
    }
  }

  const invoiceRef = strMeta(meta, 'invoice_number', 'invoiceNumber');
  const customerLabel = strMeta(meta, 'customer_label', 'customer_name');

  switch (row.entity_type) {
    case 'customer': {
      if (action === 'created') {
        return customerLabel
          ? `${actor} added ${customerLabel} as a customer`
          : `${actor} added a new customer`;
      }
      if (action === 'updated') {
        return customerLabel
          ? `${actor} updated ${customerLabel}'s profile`
          : `${actor} updated a customer profile`;
      }
      return `${actor} performed an action`;
    }
    case 'payment': {
      if (action === 'payment_recorded') {
        return invoiceRef
          ? `${actor} recorded a payment for invoice ${invoiceRef}`
          : `${actor} recorded a payment`;
      }
      return `${actor} performed an action`;
    }
    case 'invoice':
    default: {
      if (row.entity_type !== 'invoice') {
        return `${actor} performed an action`;
      }
      const sfx = formatAuditSourceSuffix(meta);
      const inv = invoiceRef ? `invoice ${invoiceRef}` : 'an invoice';
      switch (action) {
        case 'created':
          return `${actor} created ${inv}${sfx}`;
        case 'edited':
          return `${actor} edited ${inv}${sfx}`;
        case 'updated':
          return `${actor} updated ${inv}${sfx}`;
        case 'sent':
          return `${actor} sent ${inv}${sfx}`;
        case 'resent':
          return `${actor} resent ${inv}${sfx}`;
        case 'reminder_sent': {
          const rs = String(meta.reminder_source ?? '').trim().toLowerCase();
          const base =
            invoiceRef != null
              ? `${actor} sent a payment reminder for invoice ${invoiceRef}`
              : `${actor} sent a payment reminder`;
          const auto = rs === 'cron' ? ' (automatic)' : '';
          return base + auto + sfx;
        }
        case 'auto_reminders_enabled':
          return invoiceRef
            ? `${actor} enabled auto reminders for invoice ${invoiceRef}`
            : `${actor} enabled auto reminders`;
        case 'auto_reminders_updated':
          return invoiceRef
            ? `${actor} updated auto reminders for invoice ${invoiceRef}`
            : `${actor} updated auto reminders`;
        case 'auto_reminders_disabled':
          return invoiceRef
            ? `${actor} disabled auto reminders for invoice ${invoiceRef}`
            : `${actor} disabled auto reminders`;
        case 'marked_paid':
          return (
            (invoiceRef
              ? `${actor} marked invoice ${invoiceRef} as paid`
              : `${actor} marked an invoice as paid`) + sfx
          );
        case 'partially_paid':
          return (
            (invoiceRef
              ? `${actor} marked invoice ${invoiceRef} as partially paid`
              : `${actor} marked an invoice as partially paid`) + sfx
          );
        case 'voided':
          return `${actor} voided ${inv}${sfx}`;
        case 'deleted':
          return `${actor} deleted ${inv}${sfx}`;
        case 'duplicated': {
          const src = strMeta(meta, 'source_invoice_number');
          if (src && invoiceRef) return `${actor} duplicated invoice ${src} to ${invoiceRef}${sfx}`;
          if (src) return `${actor} duplicated invoice ${src}${sfx}`;
          return (
            (invoiceRef ? `${actor} duplicated to ${invoiceRef}` : `${actor} duplicated an invoice`) + sfx
          );
        }
        case 'payment_recorded':
          return (
            (invoiceRef
              ? `${actor} recorded a payment on invoice ${invoiceRef}`
              : `${actor} recorded a payment on an invoice`) + sfx
          );
        case 'refund_initiated':
          return invoiceRef
            ? `${actor} recorded a refund on invoice ${invoiceRef}`
            : `${actor} recorded a refund`;
        case 'refund_partial_initiated': {
          return invoiceRef
            ? `${actor} recorded a partial refund on invoice ${invoiceRef}`
            : `${actor} recorded a partial refund`;
        }
        case 'refund_completed': {
          return invoiceRef
            ? `${actor} recorded a refund on invoice ${invoiceRef}`
            : `${actor} recorded a refund`;
        }
        case 'refund_failed':
          return invoiceRef
            ? `${actor} refund failed for invoice ${invoiceRef}`
            : `${actor} refund failed`;
        case 'payment_plan_created':
          return (
            (invoiceRef
              ? `${actor} set up a payment plan for invoice ${invoiceRef}`
              : `${actor} set up a payment plan`) + sfx
          );
        case 'payment_plan_updated':
          return (
            (invoiceRef
              ? `${actor} updated the payment plan for invoice ${invoiceRef}`
              : `${actor} updated a payment plan`) + sfx
          );
        default:
          return `${actor} performed an action${sfx}`;
      }
    }
  }
}

export const formatAuditLogMessage = formatAuditLog;

export function formatEntityTypeLabel(type: AuditEntityType | string): string {
  if (type === 'customer') return 'Customer';
  if (type === 'invoice') return 'Invoice';
  if (type === 'payment') return 'Payment';
  if (type === 'team') return 'Team';
  return 'Other';
}

export const ENTITY_TYPE_FILTER_OPTIONS: { value: AuditEntityType; label: string }[] = [
  { value: 'customer', label: 'Customer' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment', label: 'Payment' },
  { value: 'team', label: 'Team' },
];

export const AUDIT_ACTION_FILTER_OPTIONS: { value: AuditAction; label: string }[] = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'edited', label: 'Edited' },
  { value: 'sent', label: 'Sent' },
  { value: 'resent', label: 'Resent' },
  { value: 'reminder_sent', label: 'Reminder sent' },
  { value: 'auto_reminders_enabled', label: 'Auto reminders enabled' },
  { value: 'auto_reminders_updated', label: 'Auto reminders updated' },
  { value: 'auto_reminders_disabled', label: 'Auto reminders disabled' },
  { value: 'marked_paid', label: 'Marked paid' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'voided', label: 'Voided' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'duplicated', label: 'Duplicated' },
  { value: 'payment_recorded', label: 'Payment recorded' },
  { value: 'refund_initiated', label: 'Refund initiated' },
  { value: 'refund_partial_initiated', label: 'Partial refund initiated' },
  { value: 'refund_completed', label: 'Refund completed' },
  { value: 'refund_failed', label: 'Refund failed' },
  { value: 'payment_plan_created', label: 'Payment plan created' },
  { value: 'payment_plan_updated', label: 'Payment plan updated' },
  { value: 'user_invited', label: 'User invited' },
  { value: 'invite_resent', label: 'Invite resent' },
  { value: 'invite_revoked', label: 'Invite revoked' },
  { value: 'role_changed', label: 'Role changed' },
  { value: 'user_suspended', label: 'User suspended' },
  { value: 'user_reactivated', label: 'User reactivated' },
  { value: 'user_deactivated', label: 'User deactivated' },
  { value: 'password_reset_sent', label: 'Password reset sent' },
];
