export type NotificationCategory = 'urgent' | 'action_needed' | 'opportunity' | 'info';

export type NotificationSeverity = 'high' | 'medium' | 'low';

export type NotificationType =
  | 'overdue_invoices'
  | 'accepted_quote_pending_conversion'
  | 'high_value_pending_quotes'
  | 'collections_risk'
  | 'expense_spike'
  | 'stale_quotes_follow_up'
  | 'payment_received'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'invoice_sent'
  | 'customer_created';

export type NotificationModel = {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  description: string;
  severity: NotificationSeverity;
  priorityScore: number;
  actionLabel?: string | null;
  actionTarget?: string | null;
  createdAt: string;
  read: boolean;
  dismissed: boolean;
  groupKey: string;
  metadata: Record<string, unknown>;
};

export type NotificationCandidate = Omit<NotificationModel, 'id' | 'createdAt' | 'read' | 'dismissed'> & {
  createdAt?: string;
};

