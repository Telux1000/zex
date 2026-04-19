export type AdminAuditMeta = {
  target_user_display?: string;
  ticket_number?: number;
  accountName?: string | null;
  targetName?: string | null;
  targetEmail?: string | null;
  targetAccountNumber?: string | null;
  accountId?: string | null;
  /** Internal staff profile audit (B-code at time of event). */
  targetStaffCode?: string | null;
  newFullName?: string | null;
  oldFullName?: string | null;
};

/** e.g. B001 Mark Alien for `internal_staff_profile` targets. */
export function formatInternalStaffProfileAuditTarget(
  meta: Record<string, unknown> | AdminAuditMeta | null | undefined
): string | null {
  const m = (meta ?? {}) as Record<string, unknown>;
  const code = String(m.targetStaffCode ?? '').trim();
  const name =
    String(m.newFullName ?? '').trim() ||
    String(m.targetName ?? '').trim() ||
    String(m.targetEmail ?? '').trim();
  if (code && name) return `${code} ${name}`;
  if (name) return name;
  if (code) return code;
  return null;
}

/** Subscriber workspace user line: `Hugo LLC: (Z0003) Anna Dave` */
export function formatSubscriberUserAuditTarget(meta: AdminAuditMeta | null | undefined): string | null {
  const m = meta ?? {};
  const biz = String(m.accountName ?? '').trim();
  const z = String(m.targetAccountNumber ?? '').trim();
  const name =
    String(m.targetName ?? '').trim() ||
    String(m.targetEmail ?? '').trim() ||
    String(m.target_user_display ?? '').trim();
  if (!biz && !name && !z) return null;
  const userPart = z && name ? `(${z}) ${name}` : z ? `(${z})` : name || '—';
  if (biz) return `${biz}: ${userPart}`;
  return userPart;
}

/**
 * Human-readable Target column for `admin_audit_logs` (e.g. Security page).
 * Support tickets: `support_ticket T-1024 · User (Z0001) Name` when metadata is present.
 */
export function adminAuditTargetDescription(row: {
  target_type: string | null;
  target_id: string | null;
  metadata?: unknown;
}): string {
  const meta = row.metadata as AdminAuditMeta | null | undefined;

  const tt = row.target_type ?? '—';

  if (tt === 'subscriber_user') {
    const formatted = formatSubscriberUserAuditTarget(meta);
    if (formatted) return formatted;
    if (row.target_id) return `Subscriber user ${row.target_id}`;
    return 'Subscriber user';
  }

  if (tt === 'internal_staff_profile') {
    const formatted = formatInternalStaffProfileAuditTarget(row.metadata as Record<string, unknown>);
    if (formatted) return formatted;
    if (row.target_id) return `Internal staff profile ${row.target_id}`;
    return 'Internal staff profile';
  }

  if (tt === 'support_ticket') {
    const ticketRef = typeof meta?.ticket_number === 'number' ? `T-${meta.ticket_number}` : null;
    const user = meta?.target_user_display?.trim();
    const left = ticketRef ? `${tt} ${ticketRef}` : tt;
    if (user) return `${left} · User ${user}`;
    if (row.target_id) return `${left} ${row.target_id}`;
    return left;
  }

  const label = meta?.target_user_display?.trim();
  if (label) {
    return `${tt} · User ${label}`;
  }
  if (row.target_id) {
    return `${tt} ${row.target_id}`;
  }
  return tt;
}
