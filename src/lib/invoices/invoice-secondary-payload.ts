import type { AuditLogRow } from '@/lib/audit-log';
import type { InvoiceRecurringSummary } from '@/lib/recurring-invoice/display';

/** JSON from GET /api/invoices/[id]/secondary-panels (after-load panels + refined status). */
export type InvoiceDetailSecondaryPayload = {
  auditLogs: AuditLogRow[];
  nextReminderStatusLine: string | null;
  recurringSummary: InvoiceRecurringSummary | null;
  displayStatus: string;
  showRefundAction: boolean;
};
