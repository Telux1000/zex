import { BUSINESS_MEMBER_DB_ROLES_ORDER } from '@/lib/roles/workspace-roles';

/** Same order as admin invite / change-role; labels via `workspaceRoleLabel` (Viewer, Staff). */
export const BUSINESS_MEMBER_ROLES = BUSINESS_MEMBER_DB_ROLES_ORDER;
export type BusinessMemberRole = (typeof BUSINESS_MEMBER_ROLES)[number];

export const BUSINESS_ROLES = ['owner', ...BUSINESS_MEMBER_ROLES] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export type RbacPermission =
  | 'manage_invoices'
  | 'manage_customers'
  | 'manage_settings'
  | 'manage_users'
  | 'manage_payments'
  | 'view_reports'
  | 'create_invoice'
  | 'create_customer'
  | 'view_data'
  | 'view_only'
  | 'edit_invoice'
  | 'delete_invoice';
