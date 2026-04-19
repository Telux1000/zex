'use client';

import { cn } from '@/lib/utils/cn';
import type { AdminAssignableMemberRole } from '@/lib/admin/account-member-roles';
import type { RolePickerOption } from '@/lib/admin/account-member-role-policy';

type Props = {
  value: AdminAssignableMemberRole;
  onChange: (role: AdminAssignableMemberRole) => void;
  options: RolePickerOption[];
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
};

/**
 * Subscriber workspace role control (admin invite / change-role).
 * Labels and order come from `@/lib/roles/workspace-roles` via policy helpers.
 */
export function AdminMemberRolePicker({
  value,
  onChange,
  options,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
}: Props) {
  return (
    <select
      id={id}
      aria-label={ariaLabel ?? 'Role'}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as AdminAssignableMemberRole)}
      className={cn(
        'rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled} title={o.disabledReason}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
