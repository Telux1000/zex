import { z } from 'zod';

export const RECURRING_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_END_CONDITIONS = ['never', 'end_date', 'count'] as const;
export type RecurringEndCondition = (typeof RECURRING_END_CONDITIONS)[number];

export const RECURRING_AUTOMATION_MODES = ['draft', 'auto_send'] as const;
export type RecurringAutomationMode = (typeof RECURRING_AUTOMATION_MODES)[number];

export const RECURRING_STATUSES = ['active', 'paused', 'cancelled'] as const;
export type RecurringRuleStatus = (typeof RECURRING_STATUSES)[number];

export const recurringTemplateItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  quantity: z.number(),
  unit_price: z.number(),
  amount: z.number(),
  unit_label: z.string().max(40).optional(),
  tax_percent: z.number().optional(),
  assignee: z.string().max(200).nullable().optional(),
});

export const recurringTemplateScheduleRowSchema = z.object({
  description: z.string(),
  amount: z.number(),
  days_from_issue: z.number(),
});

export const recurringTemplateSnapshotSchema = z.object({
  issue_to_due_days: z.number().int().min(0),
  customer_id: z.string().uuid().nullable(),
  customer_name: z.string(),
  customer_email: z.string().nullable(),
  currency: z.string().length(3),
  subtotal: z.number(),
  tax_amount: z.number(),
  total: z.number(),
  discount_amount: z.number(),
  reference_po: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  theme_id: z.string().uuid().nullable().optional(),
  template_id: z.enum(['classic', 'modern', 'minimal', 'bold', 'elegant']).optional(),
  metadata: z.unknown().nullable().optional(),
  use_payment_schedule: z.boolean(),
  use_customer_reminder_defaults: z.boolean().optional(),
  reminder_settings: z.unknown().nullable().optional(),
  show_time_summary: z.boolean().optional(),
  items: z.array(recurringTemplateItemSchema).min(1),
  payment_schedule_template: z.array(recurringTemplateScheduleRowSchema),
});

export type RecurringTemplateSnapshot = z.infer<typeof recurringTemplateSnapshotSchema>;

export type RecurringRuleRow = {
  id: string;
  business_id: string;
  source_invoice_id: string | null;
  template_snapshot: RecurringTemplateSnapshot;
  frequency: RecurringFrequency;
  start_date: string;
  next_run_date: string;
  end_condition_type: RecurringEndCondition;
  end_date: string | null;
  end_after_count: number | null;
  automation_mode: RecurringAutomationMode;
  status: RecurringRuleStatus;
  invoices_generated_count: number;
  last_generated_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
