export type SupportTicketStatus = 'open' | 'pending' | 'resolved' | 'closed';

export function labelSupportTicketStatus(status: string): string {
  const s = String(status ?? '').toLowerCase();
  switch (s) {
    case 'open':
      return 'Open';
    case 'pending':
      return 'Pending';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return s || '—';
  }
}

export function isSupportTicketStatus(value: unknown): value is SupportTicketStatus {
  return value === 'open' || value === 'pending' || value === 'resolved' || value === 'closed';
}
