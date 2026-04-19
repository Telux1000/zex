import type { BusinessRole, RbacPermission } from '@/lib/rbac/types';

const ROLE_PERMS: Record<Exclude<BusinessRole, 'owner'>, RbacPermission[]> = {
  admin: [
    'manage_invoices',
    'manage_customers',
    'manage_settings',
    'manage_users',
    'manage_payments',
    'view_reports',
    'create_invoice',
    'create_customer',
    'view_data',
    'view_only',
    'edit_invoice',
    'delete_invoice',
  ],
  accountant: [
    'manage_invoices',
    'manage_payments',
    'view_reports',
    'create_invoice',
    'view_data',
    'view_only',
    'edit_invoice',
    'delete_invoice',
  ],
  staff: ['create_invoice', 'create_customer', 'view_data', 'edit_invoice'],
  viewer: ['view_data', 'view_only'],
};

export function hasPermission(role: BusinessRole, permission: RbacPermission): boolean {
  if (role === 'owner') return true;
  const set = ROLE_PERMS[role];
  return set?.includes(permission) ?? false;
}

/** Same gate as dashboard financial KPIs and invoice lists (view_data). */
export function canViewFinancialDashboard(role: BusinessRole): boolean {
  return hasPermission(role, 'view_data');
}

/** AI Insights (cards + ask analyst) — aligned with financial dashboard visibility. */
export function canUseAiInsights(role: BusinessRole): boolean {
  return canViewFinancialDashboard(role);
}

export type PermissionFlags = {
  viewData: boolean;
  viewReports: boolean;
  canViewFinancialDashboard: boolean;
  canUseAiInsights: boolean;
  manageInvoices: boolean;
  createInvoice: boolean;
  editInvoice: boolean;
  deleteInvoice: boolean;
  manageCustomers: boolean;
  createCustomer: boolean;
  managePayments: boolean;
  manageSettings: boolean;
  manageUsers: boolean;
  showSettingsNav: boolean;
  showBillingNav: boolean;
  showInsightsNav: boolean;
  showExpensesWrite: boolean;
  /** Owner, workspace admin, or accountant — not staff/viewer. */
  showSupportNav: boolean;
};

export function permissionFlagsForRole(role: BusinessRole): PermissionFlags {
  const financials = canViewFinancialDashboard(role);
  return {
    viewData: hasPermission(role, 'view_data'),
    viewReports: hasPermission(role, 'view_reports'),
    canViewFinancialDashboard: financials,
    canUseAiInsights: canUseAiInsights(role),
    manageInvoices: hasPermission(role, 'manage_invoices'),
    createInvoice: hasPermission(role, 'create_invoice'),
    editInvoice: hasPermission(role, 'edit_invoice'),
    deleteInvoice: hasPermission(role, 'delete_invoice'),
    manageCustomers: hasPermission(role, 'manage_customers'),
    createCustomer: hasPermission(role, 'create_customer'),
    managePayments: hasPermission(role, 'manage_payments'),
    manageSettings: hasPermission(role, 'manage_settings'),
    manageUsers: hasPermission(role, 'manage_users'),
    showSettingsNav: role === 'owner' || role === 'admin',
    showBillingNav: hasPermission(role, 'manage_payments'),
    showInsightsNav: financials,
    showExpensesWrite: hasPermission(role, 'manage_invoices'),
    showSupportNav: role === 'owner' || role === 'admin' || role === 'accountant',
  };
}

export function defaultDeniedFlags(): PermissionFlags {
  return {
    viewData: false,
    viewReports: false,
    canViewFinancialDashboard: false,
    canUseAiInsights: false,
    manageInvoices: false,
    createInvoice: false,
    editInvoice: false,
    deleteInvoice: false,
    manageCustomers: false,
    createCustomer: false,
    managePayments: false,
    manageSettings: false,
    manageUsers: false,
    showSettingsNav: false,
    showBillingNav: false,
    showInsightsNav: false,
    showExpensesWrite: false,
    showSupportNav: false,
  };
}
