import {
  SUPPORT_PRIORITIES,
  type SupportPriority,
  isSupportPriority,
} from '@/lib/admin/support-ticket-meta';

export { SUPPORT_PRIORITIES, type SupportPriority, isSupportPriority };

/** Matches `support_tickets_priority_check`: low | medium | high | urgent */
export const DEFAULT_SUPPORT_TICKET_PRIORITY: SupportPriority = 'medium';

/**
 * Validates optional `priority` for ticket create/update API calls.
 * - Empty / omitted → {@link DEFAULT_SUPPORT_TICKET_PRIORITY}
 * - Legacy `"normal"` → `"medium"`
 * - Invalid non-empty values → error (does not silently coerce to medium)
 */
export function parseSupportTicketPriorityInput(
  input: unknown
): { ok: true; priority: SupportPriority } | { ok: false; error: string } {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: true, priority: DEFAULT_SUPPORT_TICKET_PRIORITY };
  const s = raw.toLowerCase();
  if (s === 'normal') return { ok: true, priority: 'medium' };
  if (isSupportPriority(s)) return { ok: true, priority: s };
  return {
    ok: false,
    error: 'Invalid priority. Use low, medium, high, or urgent.',
  };
}

/**
 * Lenient normalizer (e.g. admin filters): invalid values fall back to medium.
 */
export function normalizeSupportTicketPriority(input: unknown): SupportPriority {
  const r = parseSupportTicketPriorityInput(input);
  return r.ok ? r.priority : DEFAULT_SUPPORT_TICKET_PRIORITY;
}
