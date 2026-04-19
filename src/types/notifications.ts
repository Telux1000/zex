export type NotificationChannel = 'in_app' | 'email';

export type NotificationEventType =
  | 'invoice_created'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'payment_received'
  | 'customer_created'
  | 'quote_created'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'quote_converted'
  | 'expense_created'
  | 'high_expense_created'
  | 'ai_cashflow_warning'
  | 'stale_quote_followup'
  | 'accepted_quote_ready_for_invoice'
  | 'payment_reminder_upcoming'
  | 'invoice_overdue_reminder';

export type InAppSeverity = 'success' | 'info' | 'warning' | 'danger';

export type NotificationPreferenceSettings = {
  invoice_sent_emails: boolean;
  payment_received_alerts: boolean;
  payment_reminders: boolean;
  overdue_reminders: boolean;
  quote_emails: boolean;
  ai_insight_emails: boolean;
  internal_operational_alerts: boolean;
};

export type InAppNotificationInput = {
  businessId: string;
  type: NotificationEventType;
  title: string;
  message: string;
  entityType?: 'invoice' | 'quote' | 'customer' | 'expense' | 'payment' | 'system';
  entityId?: string | null;
  severity?: InAppSeverity;
  actionLabel?: string | null;
  actionTarget?: string | null;
  groupKey?: string;
  metadata?: Record<string, unknown>;
};

export type EmailDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'spam_complaint'
  | 'failed';

