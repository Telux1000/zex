'use client';

import { Eye, Shield, User, UserCheck, Users } from 'lucide-react';
import type { WorkspaceRole } from '@/lib/roles/workspace-roles';
import { parseSubscriberWorkspaceRole, workspaceRoleLabel } from '@/lib/roles/workspace-roles';

/** Visual bucket (DB-aligned colors). */
type RoleBadgeStyleKey = 'owner' | 'admin' | 'accountant' | 'staff' | 'viewer';

type RoleBadgeProps = {
  /** DB role (`viewer`, `staff`), canonical (`member`, `support`), or `owner` — same resolution as admin modals */
  role: string | null | undefined;
  showIcon?: boolean;
  className?: string;
};

const ROLE_STYLES: Record<RoleBadgeStyleKey, string> = {
  owner: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',
  admin: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  accountant: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  staff: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function styleKeyFromCanonical(canonical: WorkspaceRole): RoleBadgeStyleKey {
  if (canonical === 'support') return 'staff';
  if (canonical === 'member') return 'viewer';
  if (canonical === 'owner' || canonical === 'admin' || canonical === 'accountant') return canonical;
  return 'viewer';
}

function RoleIcon({ styleKey }: { styleKey: RoleBadgeStyleKey }) {
  const iconClass = 'h-3 w-3';
  if (styleKey === 'owner') return <Shield className={iconClass} />;
  if (styleKey === 'admin') return <UserCheck className={iconClass} />;
  if (styleKey === 'accountant') return <Users className={iconClass} />;
  if (styleKey === 'staff') return <User className={iconClass} />;
  return <Eye className={iconClass} />;
}

const EMPTY_CLASS =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-slate-400 dark:text-slate-500';

export function RoleBadge({ role, showIcon = false, className = '' }: RoleBadgeProps) {
  const canonical = parseSubscriberWorkspaceRole(role);
  if (!canonical) {
    return <span className={`${EMPTY_CLASS} ${className}`}>—</span>;
  }

  const styleKey = styleKeyFromCanonical(canonical);
  const label = workspaceRoleLabel(canonical);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${showIcon ? 'gap-1' : ''} ${ROLE_STYLES[styleKey]} ${className}`}
    >
      {showIcon ? <RoleIcon styleKey={styleKey} /> : null}
      {label}
    </span>
  );
}
