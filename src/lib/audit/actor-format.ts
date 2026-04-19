/**
 * Shared actor labels for `audit_logs`:
 * - **Subscriber/workspace actors**: Z-codes + display name (`subscriber_user`).
 * - **Internal back-office**: stable B-codes from `profiles.internal_staff_code` (`internal_admin`) — never Z-codes.
 * - **System / Assistant**: neutral or user+context labels; do not conflate with the other namespaces.
 *
 * Privacy: subscriber-facing UIs must use `audience: 'subscriber'` so internal staff emails/names are not shown
 * for back-office actions (use "Admin Back Office" + optional B-code).
 */

export const SUBSCRIBER_FACING_INTERNAL_ADMIN_LABEL = 'Admin Back Office';

export type AuditActorRowInput = {
  performed_by_name?: string;
  actor_account_number?: string | null;
  actorAccountNumber?: string | null;
};

/** View context for workspace audit copy. */
export type AuditActorAudience = 'internal' | 'subscriber';

/**
 * Logical actor type derived from row + metadata (not stored as an enum column).
 * Used to pick formatting rules without mixing Z-style identity with internal B-style identity.
 */
export type AuditActorKind = 'subscriber_user' | 'internal_admin' | 'system' | 'assistant';

export type FormatAuditActorOptions = {
  /**
   * When `audience === 'internal'` and actor is internal admin:
   * - `name` (default): `(B001) Jane Doe` using `performed_by_name` (internal attribution).
   * - `neutral`: `(B001) Admin Back Office` (no personal name — e.g. account-level activity in Admin).
   */
  internalStaffActorStyle?: 'name' | 'neutral';
};

/** True when this row was performed by internal back-office staff (metadata set at insert time). */
export function isInternalAdminAuditActor(meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta ?? {};
  if (m.actor_kind === 'internal_admin') return true;
  if (m.source === 'internal_admin') return true;
  const code = m.actor_internal_code;
  if (typeof code === 'string' && code.trim()) return true;
  return false;
}

function isAssistantActorMeta(meta: Record<string, unknown>): boolean {
  const s = String(meta.source ?? '').trim().toLowerCase();
  if (s === 'assistant' || s.startsWith('assistant_')) return true;
  return false;
}

function isSystemActorMeta(meta: Record<string, unknown>): boolean {
  if (meta.actor_kind === 'system') return true;
  const s = String(meta.source ?? '').trim().toLowerCase();
  return s === 'system';
}

/**
 * Resolve how this row should be interpreted for labeling. Internal admin is detected first so it never
 * falls through to subscriber Z-code formatting.
 */
export function resolveAuditActorKind(meta: Record<string, unknown> | null | undefined): AuditActorKind {
  const m = meta ?? {};
  if (isInternalAdminAuditActor(m)) return 'internal_admin';
  if (isSystemActorMeta(m)) return 'system';
  if (isAssistantActorMeta(m)) return 'assistant';
  return 'subscriber_user';
}

/** Workspace member (subscriber) actor: `(Zxxxx) Name` from `actor_account_number` + `performed_by_name`. */
export function formatSubscriberMemberActorDisplay(row: AuditActorRowInput): string {
  const name = row.performed_by_name?.trim() || 'Someone';
  const num = String(row.actor_account_number ?? row.actorAccountNumber ?? '').trim();
  return num ? `(${num}) ${name}` : name;
}

function formatInternalAdminActorDisplay(
  row: AuditActorRowInput,
  meta: Record<string, unknown>,
  audience: AuditActorAudience,
  style: FormatAuditActorOptions['internalStaffActorStyle']
): string {
  const code = typeof meta.actor_internal_code === 'string' ? meta.actor_internal_code.trim() : '';
  const neutralLabel = code
    ? `(${code}) ${SUBSCRIBER_FACING_INTERNAL_ADMIN_LABEL}`
    : SUBSCRIBER_FACING_INTERNAL_ADMIN_LABEL;

  if (audience === 'subscriber') {
    return neutralLabel;
  }

  const useNeutral = style === 'neutral';
  if (useNeutral) return neutralLabel;

  const name = row.performed_by_name?.trim() || 'Someone';
  return code ? `(${code}) ${name}` : name;
}

function formatSystemActorDisplay(meta: Record<string, unknown>): string {
  const label = meta.system_actor_label ?? meta.actor_label;
  if (typeof label === 'string' && label.trim()) return label.trim();
  return 'System';
}

/**
 * Primary entry: one actor prefix for an audit line, using namespace + audience + optional internal style.
 */
export function formatAuditActorDisplay(
  row: AuditActorRowInput,
  meta: Record<string, unknown>,
  audience: AuditActorAudience,
  options?: FormatAuditActorOptions
): string {
  const kind = resolveAuditActorKind(meta);

  switch (kind) {
    case 'internal_admin':
      return formatInternalAdminActorDisplay(row, meta, audience, options?.internalStaffActorStyle ?? 'name');
    case 'system':
      return formatSystemActorDisplay(meta);
    case 'assistant':
      // Actor is still the workspace user; "via Assistant" is usually appended on invoice actions separately.
      return formatSubscriberMemberActorDisplay(row);
    case 'subscriber_user':
    default:
      return formatSubscriberMemberActorDisplay(row);
  }
}
