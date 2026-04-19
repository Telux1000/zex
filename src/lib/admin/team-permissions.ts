import type { AdminRole } from '@/lib/admin/auth';

export type InternalStaffInviteRole = 'admin' | 'support';

export function isInviteRole(value: string | null | undefined): value is InternalStaffInviteRole {
  return value === 'admin' || value === 'support';
}

/** View team list: all active internal staff. */
export function canViewTeam(actor: AdminRole): boolean {
  return actor === 'owner' || actor === 'admin' || actor === 'support';
}

/** Create/resend/revoke invites. */
export function canManageInvites(actor: AdminRole): boolean {
  return actor === 'owner' || actor === 'admin';
}

/** Deactivate, reactivate, change role (subject to target rules). */
export function canManageStaffMembers(actor: AdminRole): boolean {
  return actor === 'owner' || actor === 'admin';
}

/** Owner row cannot be modified by admin; only owner can touch other owners (rare). */
export function canModifyTargetStaff(actor: AdminRole, targetInternalRole: AdminRole): boolean {
  if (actor === 'owner') {
    return true;
  }
  if (actor === 'admin') {
    return targetInternalRole === 'support';
  }
  return false;
}

/** Never assign owner via product UI. */
export function canAssignRole(actor: AdminRole, newRole: AdminRole): boolean {
  if (newRole === 'owner') return false;
  if (actor === 'owner') {
    return newRole === 'admin' || newRole === 'support';
  }
  if (actor === 'admin') {
    return newRole === 'admin' || newRole === 'support';
  }
  return false;
}
