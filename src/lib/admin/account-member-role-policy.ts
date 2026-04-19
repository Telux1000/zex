import type { AdminAccountMemberRole, AdminAssignableMemberRole } from '@/lib/admin/account-member-roles';
import type { TenantUserLifecycleStatus } from '@/lib/admin/account-lifecycle';
import {
  isWorkspaceAssignableRole,
  workspaceRoleLabel,
  WORKSPACE_ASSIGNABLE_ROLES_ORDER,
} from '@/lib/roles/workspace-roles';

/** @deprecated use WORKSPACE_ASSIGNABLE_ROLES_ORDER from @/lib/roles/workspace-roles */
export const ASSIGNABLE_MEMBER_ROLES = WORKSPACE_ASSIGNABLE_ROLES_ORDER;

export type RolePickerOption = {
  value: AdminAssignableMemberRole;
  label: string;
  disabled: boolean;
  disabledReason?: string;
};

export function isAssignableMemberRole(value: string): value is AdminAssignableMemberRole {
  return isWorkspaceAssignableRole(value);
}

/** Invite flow: all assignable roles (server still enforces permissions). */
export function buildInviteRolePickerOptions(): RolePickerOption[] {
  return WORKSPACE_ASSIGNABLE_ROLES_ORDER.map((value) => ({
    value,
    label: workspaceRoleLabel(value),
    disabled: false,
  }));
}

/**
 * Member role change (inline + modal): shared options, disabled states, and reasons.
 * Mirrors server rules in `validateMemberRoleChange` (last admin, lifecycle).
 */
export function buildMemberRolePickerOptions(args: {
  currentRole: AdminAssignableMemberRole;
  memberStatus: TenantUserLifecycleStatus;
  canManageLifecycle: boolean;
  /** business_members rows with role === 'admin' (subscriber admin), excluding owner row */
  adminMemberCount: number;
}): RolePickerOption[] {
  const { currentRole, memberStatus, canManageLifecycle, adminMemberCount } = args;
  const lastAdminTrap = currentRole === 'admin' && adminMemberCount <= 1;

  return WORKSPACE_ASSIGNABLE_ROLES_ORDER.map((value) => {
    let disabled = false;
    let disabledReason: string | undefined;

    if (!canManageLifecycle) {
      disabled = true;
      disabledReason = 'You do not have permission to change subscriber roles.';
    } else if (memberStatus !== 'active' && memberStatus !== 'pending') {
      disabled = true;
      disabledReason = 'Role can only be changed for active or pending users.';
    } else if (lastAdminTrap && value !== 'admin') {
      disabled = true;
      disabledReason = 'Cannot remove the last admin from this account.';
    }

    return {
      value,
      label: workspaceRoleLabel(value),
      disabled,
      disabledReason,
    };
  });
}

export function canChangeSubscriberMemberRole(args: {
  canManageLifecycle: boolean;
  memberRole: AdminAccountMemberRole;
  memberStatus: TenantUserLifecycleStatus;
}): boolean {
  return (
    args.canManageLifecycle &&
    args.memberRole !== 'owner' &&
    (args.memberStatus === 'active' || args.memberStatus === 'pending')
  );
}

type MemberRow = { user_id: string; role: string };

/**
 * Server-side validation for PATCH { role }. Call after auth and owner check.
 */
export function validateMemberRoleChange(args: {
  businessOwnerId: string;
  targetUserId: string;
  newRole: AdminAssignableMemberRole;
  memberRows: MemberRow[];
}): { ok: true } | { ok: false; error: string; status?: number } {
  if (String(args.targetUserId) === String(args.businessOwnerId)) {
    return { ok: false, error: 'Cannot change the account owner role.', status: 400 };
  }

  const targetRow = args.memberRows.find((m) => String(m.user_id) === String(args.targetUserId));
  if (!targetRow) {
    return { ok: false, error: 'User is not a member of this account.', status: 404 };
  }

  const adminCount = args.memberRows.filter((m) => m.role === 'admin').length;
  const targetIsAdmin = targetRow.role === 'admin';
  if (targetIsAdmin && args.newRole !== 'admin' && adminCount <= 1) {
    return {
      ok: false,
      error: 'Cannot change the role of the last admin in this account.',
      status: 400,
    };
  }

  return { ok: true };
}
