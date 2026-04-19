/** Human-readable support ticket ref (e.g. T-1001). */
export function formatSupportTicketRef(ticketNumber: number): string {
  return `T-${Math.floor(Number(ticketNumber))}`;
}
