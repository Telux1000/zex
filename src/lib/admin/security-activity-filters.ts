/** Activity tab categories → admin_audit_logs.action values. */
export const SECURITY_ACTIVITY_CATEGORIES = [
  'all',
  'access',
  'invites',
  'accounts',
  'subscriber_users',
  'password',
  'policies',
  'views',
] as const;

export type SecurityActivityCategory = (typeof SECURITY_ACTIVITY_CATEGORIES)[number];

const ACCESS_ACTIONS = [
  'internal_staff_role_changed',
  'internal_staff_deactivated',
  'internal_staff_reactivated',
  'internal_staff_profile_name_updated',
  'admin_user_suspended',
  'admin_user_reactivated',
  'admin_subscriber_user_suspended',
  'admin_subscriber_user_reactivated',
  'admin_subscriber_user_deactivated',
] as const;

const INVITE_ACTIONS = [
  'internal_staff_invite_created',
  'internal_staff_invite_resent',
  'internal_staff_invite_revoked',
  'internal_staff_invite_accepted',
] as const;

const ACCOUNT_ACTIONS = [
  'admin_account_suspended',
  'admin_account_reactivated',
  'admin_account_deactivated',
] as const;

const PASSWORD_ACTIONS = ['admin_subscriber_password_reset_sent'] as const;

const POLICY_ACTIONS = ['internal_security_policy_updated', 'admin_platform_settings_updated'] as const;

const VIEW_ACTIONS = [
  'admin_view_security',
  'admin_view_team',
  'admin_view_accounts',
  'admin_view_users',
  'admin_view_billing',
  'admin_view_support',
  'admin_view_analytics',
] as const;

export function actionsForSecurityActivityCategory(category: string): string[] | null {
  switch (category) {
    case 'all':
      return null;
    case 'access':
      return [...ACCESS_ACTIONS];
    case 'invites':
      return [...INVITE_ACTIONS];
    case 'accounts':
      return [...ACCOUNT_ACTIONS];
    case 'subscriber_users':
      return [
        'admin_subscriber_user_suspended',
        'admin_subscriber_user_reactivated',
        'admin_subscriber_user_deactivated',
      ];
    case 'password':
      return [...PASSWORD_ACTIONS];
    case 'policies':
      return [...POLICY_ACTIONS];
    case 'views':
      return [...VIEW_ACTIONS];
    default:
      return null;
  }
}

export const HIGH_SIGNAL_SECURITY_ACTIONS = [
  'admin_user_suspended',
  'admin_user_reactivated',
  'admin_account_suspended',
  'admin_account_deactivated',
  'admin_subscriber_user_suspended',
  'admin_subscriber_user_deactivated',
  'internal_staff_deactivated',
  'internal_staff_role_changed',
  'internal_security_policy_updated',
  'admin_subscriber_password_reset_sent',
] as const;
