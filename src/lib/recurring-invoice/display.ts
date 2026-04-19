import type { RecurringAutomationMode, RecurringFrequency } from '@/lib/recurring-invoice/types';

const FREQ: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function recurringFrequencyLabel(frequency: string): string {
  return FREQ[frequency] ?? frequency;
}

export function recurringAutomationLabel(mode: RecurringAutomationMode | string): string {
  return mode === 'auto_send' ? 'Auto-send' : 'Auto-create draft';
}

export type RecurringRuleListFields = {
  id: string;
  source_invoice_id: string | null;
  frequency: string;
  next_run_date: string;
  automation_mode: string;
  status: string;
};

export type InvoiceRecurringSummary = {
  rule_id: string;
  frequency: string;
  frequency_label: string;
  next_run_date: string;
  automation_mode: string;
  automation_label: string;
  schedule_status: string;
  role: 'template' | 'generated';
};

export function recurringSummaryFromRuleRow(
  rule: RecurringRuleListFields,
  role: 'template' | 'generated'
): InvoiceRecurringSummary {
  const automation_mode = String(rule.automation_mode ?? 'draft') as RecurringAutomationMode;
  return {
    rule_id: rule.id,
    frequency: rule.frequency,
    frequency_label: recurringFrequencyLabel(rule.frequency),
    next_run_date: String(rule.next_run_date ?? '').slice(0, 10),
    automation_mode,
    automation_label: recurringAutomationLabel(automation_mode),
    schedule_status: String(rule.status ?? ''),
    role,
  };
}

export function buildInvoiceRecurringSummary(
  invoiceId: string,
  recurringRuleId: string | null | undefined,
  rulesById: Map<string, RecurringRuleListFields>,
  rulesBySourceInvoiceId: Map<string, RecurringRuleListFields>
): InvoiceRecurringSummary | null {
  let rule: RecurringRuleListFields | undefined;
  let role: 'template' | 'generated' = 'generated';

  if (recurringRuleId) {
    rule = rulesById.get(recurringRuleId);
    role = 'generated';
  }
  if (!rule) {
    rule = rulesBySourceInvoiceId.get(invoiceId);
    role = 'template';
  }
  if (!rule) return null;

  const automation_mode = String(rule.automation_mode ?? 'draft') as RecurringAutomationMode;
  return {
    rule_id: rule.id,
    frequency: rule.frequency,
    frequency_label: recurringFrequencyLabel(rule.frequency),
    next_run_date: String(rule.next_run_date ?? '').slice(0, 10),
    automation_mode,
    automation_label: recurringAutomationLabel(automation_mode),
    schedule_status: String(rule.status ?? ''),
    role,
  };
}
