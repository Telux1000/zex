import type { AdminRole } from '@/lib/admin/auth';

/** Admin-facing account (subscriber business) lifecycle. */
export type AccountLifecycleStatus = 'active' | 'suspended' | 'deactivated';

/** Admin-facing tenant user row (owner or member). */
export type TenantUserLifecycleStatus = 'active' | 'suspended' | 'deactivated' | 'pending' | 'invited';

export type AccountLifecycleAction = 'suspend' | 'reactivate' | 'deactivate';

export function deriveAccountLifecycleStatus(row: {
  admin_suspended_at?: string | null;
  admin_deactivated_at?: string | null;
}): AccountLifecycleStatus {
  if (row.admin_deactivated_at) return 'deactivated';
  if (row.admin_suspended_at) return 'suspended';
  return 'active';
}

export function deriveMemberUserStatus(row: {
  suspended_at?: string | null;
  deactivated_at?: string | null;
  last_sign_in_at?: string | null;
}): Exclude<TenantUserLifecycleStatus, 'invited'> {
  if (row.deactivated_at) return 'deactivated';
  if (row.suspended_at) return 'suspended';
  if (!row.last_sign_in_at) return 'pending';
  return 'active';
}

export function deriveOwnerUserStatus(row: {
  subscriber_admin_suspended_at?: string | null;
  subscriber_admin_deactivated_at?: string | null;
  last_sign_in_at?: string | null;
}): Exclude<TenantUserLifecycleStatus, 'invited'> {
  if (row.subscriber_admin_deactivated_at) return 'deactivated';
  if (row.subscriber_admin_suspended_at) return 'suspended';
  if (!row.last_sign_in_at) return 'pending';
  return 'active';
}

/** Allowed account lifecycle transition for validation (server). */
export function nextAccountStatusAfterAction(
  current: AccountLifecycleStatus,
  action: AccountLifecycleAction
): AccountLifecycleStatus | null {
  if (action === 'suspend') {
    if (current === 'active') return 'suspended';
    return null;
  }
  if (action === 'deactivate') {
    if (current === 'active' || current === 'suspended') return 'deactivated';
    return null;
  }
  if (action === 'reactivate') {
    if (current === 'suspended' || current === 'deactivated') return 'active';
    return null;
  }
  return null;
}

/** Actions to show in admin account menu (no duplicates for current state). */
export function allowedAccountLifecycleActions(status: AccountLifecycleStatus): AccountLifecycleAction[] {
  switch (status) {
    case 'active':
      return ['suspend', 'deactivate'];
    case 'suspended':
      return ['reactivate', 'deactivate'];
    case 'deactivated':
      return ['reactivate'];
    default:
      return [];
  }
}

/** Internal admin: owner/admin can change subscriber lifecycle; support is read-only. */
export function canManageSubscriberLifecycle(actor: AdminRole): boolean {
  return actor === 'owner' || actor === 'admin';
}
