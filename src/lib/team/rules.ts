import type { BusinessMemberRole, BusinessRole } from '@/lib/rbac/types';

export type TeamStatus = 'active' | 'suspended' | 'pending_invite';

export const MANAGEABLE_BY_ADMIN: readonly BusinessMemberRole[] = ['accountant', 'staff', 'viewer'] as const;

export function canInviteRole(actorRole: BusinessRole, targetRole: BusinessMemberRole): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return (MANAGEABLE_BY_ADMIN as readonly string[]).includes(targetRole);
  return false;
}

export function canManageMember(args: {
  actorRole: BusinessRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: BusinessRole;
}): boolean {
  const { actorRole, actorUserId, targetUserId, targetRole } = args;
  if (actorUserId === targetUserId) return false;
  if (actorRole === 'owner') return targetRole !== 'owner';
  if (actorRole === 'admin') return (MANAGEABLE_BY_ADMIN as readonly string[]).includes(targetRole);
  return false;
}

export function canChangeRole(args: {
  actorRole: BusinessRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: BusinessRole;
  nextRole: BusinessMemberRole;
}): boolean {
  const { actorRole, actorUserId, targetUserId, targetRole, nextRole } = args;
  if (actorUserId === targetUserId) return false;
  if (actorRole === 'owner') return targetRole !== 'owner';
  if (actorRole === 'admin') {
    const set = MANAGEABLE_BY_ADMIN as readonly string[];
    return set.includes(targetRole) && set.includes(nextRole);
  }
  return false;
}

