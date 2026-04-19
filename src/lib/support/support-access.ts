import type { BusinessRole } from '@/lib/rbac/types';

/** Workspace roles that can open the Support inbox (not staff/viewer). */
export function canAccessSupportInbox(role: BusinessRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'accountant';
}
