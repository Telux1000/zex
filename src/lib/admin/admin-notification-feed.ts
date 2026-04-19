export type AdminBellSeverity = 'high' | 'medium' | 'low';

export type AdminBellItem = {
  id: string;
  action: string;
  title: string;
  description: string;
  severity: AdminBellSeverity;
  createdAt: string;
  href: string | null;
};

/** Audit actions that should never appear in the system-alerts bell (nav noise, tickets, support). */
export function isExcludedAdminBellAuditAction(action: string): boolean {
  const a = action.toLowerCase();
  if (a.startsWith('admin_view_')) return true;
  if (a.startsWith('admin_ticket')) return true;
  return false;
}

function severityForAction(action: string): AdminBellSeverity {
  const a = action.toLowerCase();
  if (
    a.includes('suspended') ||
    a.includes('deactivated') ||
    a.includes('security') ||
    a.includes('password_reset') ||
    a.includes('revoked')
  ) {
    return 'high';
  }
  if (a.includes('invite') || a.includes('role') || a.includes('billing') || a.includes('platform_settings')) {
    return 'medium';
  }
  return 'medium';
}

function hrefForAction(action: string): string | null {
  const a = action.toLowerCase();
  if (a.startsWith('internal_staff_')) return '/admin/team';
  if (a.startsWith('internal_security_')) return '/admin/security';
  if (a.includes('platform_settings')) return '/admin/settings';
  if (a.includes('billing')) return '/admin/billing';
  if (a.startsWith('admin_account_') || a.startsWith('admin_subscriber_')) return '/admin/accounts';
  return '/admin';
}

function titleAndDescription(row: {
  action: string;
  actor_role: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
}): { title: string; description: string } {
  const action = row.action;
  const meta = row.metadata ?? {};

  switch (action) {
    case 'internal_security_policy_updated':
      return {
        title: 'Security policy updated',
        description: 'Internal MFA or security settings were changed.',
      };
    case 'admin_platform_settings_updated':
      return {
        title: 'Platform settings updated',
        description: 'Billing, email, or platform defaults may have changed.',
      };
    case 'admin_billing_synced':
      return {
        title: 'Billing sync completed',
        description: 'Subscription or billing data was refreshed from Stripe.',
      };
    case 'internal_staff_invite_created':
      return {
        title: 'Staff invite sent',
        description: String(meta.email ?? meta.invite_email ?? 'A new internal staff invite was created.'),
      };
    case 'internal_staff_invite_resent':
      return {
        title: 'Staff invite resent',
        description: String(meta.email ?? 'An invite email was resent.'),
      };
    case 'internal_staff_invite_revoked':
      return {
        title: 'Staff invite revoked',
        description: 'A pending internal staff invite was revoked.',
      };
    case 'internal_staff_invite_accepted':
      return {
        title: 'Staff invite accepted',
        description: 'A new team member joined internal staff.',
      };
    case 'internal_staff_role_changed':
      return {
        title: 'Staff role changed',
        description: 'An internal staff member’s role was updated.',
      };
    case 'internal_staff_deactivated':
      return {
        title: 'Staff access deactivated',
        description: 'An internal staff account was deactivated.',
      };
    case 'internal_staff_reactivated':
      return {
        title: 'Staff access reactivated',
        description: 'An internal staff account was reactivated.',
      };
    case 'internal_staff_profile_name_updated':
      return {
        title: 'Staff profile updated',
        description: 'An internal staff display name was changed.',
      };
    case 'admin_account_suspended':
    case 'admin_account_reactivated':
    case 'admin_account_deactivated':
      return {
        title: 'Account status changed',
        description: `Action: ${action.replace(/^admin_account_/, '').replace(/_/g, ' ')}`,
      };
    case 'admin_subscriber_user_suspended':
    case 'admin_subscriber_user_reactivated':
    case 'admin_subscriber_user_deactivated':
      return {
        title: 'Subscriber user status changed',
        description: `Action: ${action.replace(/^admin_subscriber_user_/, '').replace(/_/g, ' ')}`,
      };
    case 'admin_subscriber_password_reset_sent':
      return {
        title: 'Password reset sent',
        description: 'A password reset was triggered for a subscriber user.',
      };
    case 'admin_user_suspended':
      return {
        title: 'User suspended',
        description: 'A user account was suspended from the admin console.',
      };
    default:
      return {
        title: 'Admin activity',
        description: `${row.action.replace(/_/g, ' ')} (${row.actor_role})`,
      };
  }
}

export function mapAuditRowToBellItem(row: {
  id: string;
  action: string;
  actor_role: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}): AdminBellItem {
  const { title, description } = titleAndDescription(row);
  return {
    id: row.id,
    action: row.action,
    title,
    description,
    severity: severityForAction(row.action),
    createdAt: row.created_at,
    href: hrefForAction(row.action),
  };
}

/** Matches actionable unread semantics aligned with subscriber notifications (ignore low noise). */
export function computeAdminBellUnreadCount(items: AdminBellItem[], readIds: Set<string>): number {
  return items.filter((n) => !readIds.has(n.id) && n.severity !== 'low').length;
}
