/**
 * Admin API / legacy names for workspace roles — re-exports canonical definitions.
 * Prefer `@/lib/roles/workspace-roles` in new code.
 */
export type {
  WorkspaceRole as AdminAccountMemberRole,
  WorkspaceAssignableRole as AdminAssignableMemberRole,
} from '@/lib/roles/workspace-roles';

export {
  dbMemberRoleToCanonical as dbRoleToAdminRole,
  canonicalAssignableToDb as adminRoleToDbRole,
  workspaceRoleLabel as adminRoleLabel,
} from '@/lib/roles/workspace-roles';
