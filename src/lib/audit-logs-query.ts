/**
 * Shared text-search OR clause for `audit_logs` queries (subscriber + admin).
 * Matches Settings → Audit Log search behavior.
 */
export function escapeLike(input: string): string {
  return input.replace(/[%_]/g, '\\$&').replace(/,/g, '\\,');
}

export function buildAuditLogSearchOrClause(search: string): string | null {
  const q = search.trim();
  if (!q) return null;
  const pattern = `%${escapeLike(q)}%`;
  return [
    `metadata->>invoice_number.ilike.${pattern}`,
    `metadata->>invoiceNumber.ilike.${pattern}`,
    `metadata->>customer_name.ilike.${pattern}`,
    `metadata->>customer_label.ilike.${pattern}`,
    `metadata->>invoiceId.ilike.${pattern}`,
    `metadata->>invoice_id.ilike.${pattern}`,
    `metadata->>email.ilike.${pattern}`,
    `metadata->>target_name.ilike.${pattern}`,
    `metadata->>targetName.ilike.${pattern}`,
    `metadata->>full_name.ilike.${pattern}`,
    `actor_account_number.ilike.${pattern}`,
    `target_account_number.ilike.${pattern}`,
    `target_name_snapshot.ilike.${pattern}`,
    `entity_id.ilike.${pattern}`,
    `action.ilike.${pattern}`,
    `performed_by_name.ilike.${pattern}`,
  ].join(',');
}

/** Invoice / reminder–related actions (used for “Reminders” resource filter). */
export const AUDIT_REMINDER_ACTION_GROUP = [
  'reminder_sent',
  'auto_reminders_enabled',
  'auto_reminders_updated',
  'auto_reminders_disabled',
] as const;
