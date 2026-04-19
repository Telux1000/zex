/**
 * Single source of truth for subscriber workspace roles (keys, labels, order, DB mapping).
 * Use everywhere: dashboard Team/RoleBadge, admin account users, invite/change-role, API validation.
 *
 * DB (`business_members`, `business_team_invites`, team APIs): admin, accountant, viewer, staff.
 * Canonical API keys `member` / `support` map to UI labels **Viewer** / **Staff** (same as product Team UI).
 */

export type WorkspaceMemberDbRole = 'admin' | 'accountant' | 'viewer' | 'staff';

export type WorkspaceRole = 'owner' | 'admin' | 'accountant' | 'member' | 'support';

export type WorkspaceAssignableRole = Exclude<WorkspaceRole, 'owner'>;

/** Assignable roles in display / picker order: Admin, Accountant, Staff, Viewer. */
export const WORKSPACE_ASSIGNABLE_ROLES_ORDER: readonly WorkspaceAssignableRole[] = [
  'admin',
  'accountant',
  'support',
  'member',
];

/**
 * DB enum order for `business_members.role` — same sequence as canonical assignables.
 * Re-exported by `@/lib/rbac/types` as `BUSINESS_MEMBER_ROLES`.
 */
export const BUSINESS_MEMBER_DB_ROLES_ORDER: readonly WorkspaceMemberDbRole[] = [
  'admin',
  'accountant',
  'staff',
  'viewer',
];

export const WORKSPACE_ROLE_DESCRIPTIONS: Record<WorkspaceAssignableRole, string> = {
  admin: 'Full workspace access including team and settings.',
  accountant: 'Invoices, payments, and financial reports.',
  member: 'View workspace data (read-only).',
  support: 'Create and edit invoices and customers with limited access.',
};

export function dbMemberRoleToCanonical(db: string): WorkspaceRole {
  const n = db.toLowerCase();
  if (n === 'owner') return 'owner';
  if (n === 'admin') return 'admin';
  if (n === 'accountant') return 'accountant';
  if (n === 'staff') return 'support';
  if (n === 'viewer') return 'member';
  if (n === 'member') return 'member';
  if (n === 'support') return 'support';
  return 'member';
}

const CANONICAL_SET: ReadonlySet<string> = new Set(['owner', 'admin', 'accountant', 'member', 'support']);

/**
 * Resolves the current user's subscriber role to the same canonical keys used in
 * Admin → Invite user / Change role (owner | admin | accountant | member | support).
 * Prefer `business_role` from RBAC (`getEffectiveBusinessRole`); then `profiles.role`.
 */
export function resolveSubscriberWorkspaceRole(
  businessRole: string | null | undefined,
  profileRoleFallback: string | null | undefined
): WorkspaceRole | null {
  const fromBusiness = normalizeSubscriberRoleToken(businessRole);
  if (fromBusiness) return fromBusiness;
  return normalizeSubscriberRoleToken(profileRoleFallback);
}

function normalizeSubscriberRoleToken(raw: string | null | undefined): WorkspaceRole | null {
  const n = String(raw ?? '').trim().toLowerCase();
  if (!n) return null;
  if (CANONICAL_SET.has(n)) return n as WorkspaceRole;
  if (n === 'viewer' || n === 'staff') return dbMemberRoleToCanonical(n);
  return null;
}

/** Parse a single role string (DB or canonical) for UI — same labels as admin Invite/Change role. */
export function parseSubscriberWorkspaceRole(raw: string | null | undefined): WorkspaceRole | null {
  return normalizeSubscriberRoleToken(raw);
}

export function canonicalAssignableToDb(role: WorkspaceAssignableRole): WorkspaceMemberDbRole {
  if (role === 'admin') return 'admin';
  if (role === 'accountant') return 'accountant';
  if (role === 'member') return 'viewer';
  return 'staff';
}

export function workspaceRoleLabel(role: WorkspaceRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'accountant':
      return 'Accountant';
    case 'member':
      return 'Viewer';
    case 'support':
      return 'Staff';
  }
}

/** `profiles.role`, `business_members.role`, or canonical strings → product labels (Viewer/Staff) */
export function workspaceRoleLabelFromUnknown(raw: string | null | undefined): string {
  return workspaceRoleLabel(dbMemberRoleToCanonical(String(raw ?? '')));
}

export function isWorkspaceAssignableRole(value: string): value is WorkspaceAssignableRole {
  return (WORKSPACE_ASSIGNABLE_ROLES_ORDER as readonly string[]).includes(value);
}
