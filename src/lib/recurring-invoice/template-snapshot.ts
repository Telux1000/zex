import type { RecurringTemplateSnapshot } from '@/lib/recurring-invoice/types';

type SourceItem = {
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_percent?: number | null;
  unit_label?: string | null;
  assignee?: string | null;
};

type SourceScheduleRow = {
  description: string;
  amount: number;
  due_date: string;
};

type SourceInvoice = {
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  discount_amount?: number | null;
  reference_po?: string | null;
  notes?: string | null;
  terms?: string | null;
  theme_id?: string | null;
  metadata?: unknown;
  use_payment_schedule?: boolean | null;
  use_customer_reminder_defaults?: boolean | null;
  reminder_settings?: unknown;
  issue_date?: string | null;
  due_date?: string | null;
  invoice_items?: SourceItem[] | null;
  invoice_payment_schedule_items?: SourceScheduleRow[] | null;
};

function issueToDueDays(issueDateStr: string | null | undefined, dueDateStr: string | null | undefined): number {
  if (!issueDateStr || !dueDateStr) return 30;
  const issue = new Date(issueDateStr);
  const due = new Date(dueDateStr);
  if (Number.isNaN(issue.getTime()) || Number.isNaN(due.getTime())) return 30;
  const ms = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((due.getTime() - issue.getTime()) / ms));
}

function daysFromIssue(issueDateStr: string | null | undefined, rowDue: string): number {
  if (!issueDateStr) return 0;
  const issue = new Date(issueDateStr);
  const due = new Date(rowDue);
  if (Number.isNaN(issue.getTime()) || Number.isNaN(due.getTime())) return 0;
  const ms = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((due.getTime() - issue.getTime()) / ms));
}

export function buildTemplateSnapshotFromInvoiceSource(source: SourceInvoice | Record<string, unknown>): RecurringTemplateSnapshot {
  const s = source as SourceInvoice;
  const items = (s.invoice_items ?? [])
    .map((item) => ({
      name: String(item.name ?? '').trim(),
      description: item.description ?? null,
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      amount: Number(item.amount ?? 0),
      tax_percent: item.tax_percent != null ? Number(item.tax_percent) : 0,
      unit_label: item.unit_label != null ? String(item.unit_label) : undefined,
      assignee: item.assignee != null ? String(item.assignee) : null,
    }))
    .filter((item) => item.name.length > 0);

  const useSchedule = !!s.use_payment_schedule;
  const scheduleRows = s.invoice_payment_schedule_items ?? [];
  const payment_schedule_template = useSchedule
    ? scheduleRows.map((row) => ({
        description: String(row.description ?? ''),
        amount: Number(row.amount ?? 0),
        days_from_issue: daysFromIssue(s.issue_date ?? null, String(row.due_date ?? '')),
      }))
    : [];

  return {
    issue_to_due_days: issueToDueDays(s.issue_date ?? null, s.due_date ?? null),
    customer_id: s.customer_id ? String(s.customer_id) : null,
    customer_name: String(s.customer_name ?? '').trim(),
    customer_email: s.customer_email ? String(s.customer_email).trim() : null,
    currency: (() => {
      const c = String(s.currency ?? 'USD').trim().toUpperCase();
      return c.length === 3 ? c : 'USD';
    })(),
    subtotal: Number(s.subtotal ?? 0),
    tax_amount: Number(s.tax_amount ?? 0),
    total: Number(s.total ?? 0),
    discount_amount: Number(s.discount_amount ?? 0),
    reference_po: s.reference_po ?? null,
    notes: s.notes ?? null,
    terms: s.terms ?? null,
    theme_id: s.theme_id ? String(s.theme_id) : null,
    metadata: s.metadata ?? null,
    use_payment_schedule: useSchedule,
    use_customer_reminder_defaults: s.use_customer_reminder_defaults !== false,
    reminder_settings: s.reminder_settings ?? null,
    show_time_summary: !!(s as { show_time_summary?: boolean }).show_time_summary,
    items,
    payment_schedule_template,
  };
}
