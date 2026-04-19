/**
 * Query params for admin drill-down from Analytics (and cross-links).
 * Keep in sync with AdminAccountsPanel, AdminUsersPanel, AdminBillingPanel parsers.
 */

export const ANALYTICS_DRILLDOWN = {
  accountsActive30d: '/admin/accounts?activity=active_30d&range=30d',
  accountsInactive30d: '/admin/accounts?activity=inactive_30d&range=30d',
  accountsNoUsage: '/admin/accounts?activity=no_activity&range=30d',
  usersSignin30d: '/admin/users?segment=signin_30d&range=30d',
  billingPastDue: '/admin/billing?subscription=past_due',
  billingTrialingRenewal30d: '/admin/billing?subscription=trialing&renewal=next_30d',
  billingOverview: '/admin/billing',
  accountsUsageAi: '/admin/accounts?usage=ai_30d&range=30d',
  accountsUsageReminders: '/admin/accounts?usage=reminders_30d&range=30d',
  accountsUsageScheduled: '/admin/accounts?usage=scheduled_30d&range=30d',
} as const;
