export const SUPPORT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export function labelSupportPriority(p: string): string {
  const x = String(p ?? '').toLowerCase();
  if (x === 'low') return 'Low';
  if (x === 'medium') return 'Medium';
  if (x === 'high') return 'High';
  if (x === 'urgent') return 'Urgent';
  return x || '—';
}

export function isSupportPriority(v: unknown): v is SupportPriority {
  return SUPPORT_PRIORITIES.includes(v as SupportPriority);
}

/** Queue row age / attention hints (best-effort, no message scan). */
export function supportTicketQueueHints(createdAtIso: string, updatedAtIso: string, status: string): string[] {
  const hints: string[] = [];
  const created = new Date(createdAtIso).getTime();
  const updated = new Date(updatedAtIso).getTime();
  const now = Date.now();
  if (!Number.isNaN(created) && now - created < 2 * 3600_000) {
    hints.push('New');
  }
  const st = String(status).toLowerCase();
  if (st === 'pending' && !Number.isNaN(updated) && now - updated >= 86400_000) {
    const days = Math.floor((now - updated) / 86400_000);
    hints.push(days >= 2 ? `Waiting ${days}d` : 'Waiting 1 day');
  }
  return hints;
}
