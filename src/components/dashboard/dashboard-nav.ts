import type { LucideIcon } from 'lucide-react';
import type { PermissionFlags } from '@/lib/rbac/permissions';
import {
  Activity,
  Bot,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  PlusCircle,
  Receipt,
  Settings,
  Sparkles,
  Users,
  Wallet,
  CreditCard,
} from 'lucide-react';

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const dashboardNavItems: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/assistant', label: 'Assistant', icon: Bot },
  { href: '/dashboard/create', label: 'Create', icon: PlusCircle },
  { href: '/dashboard/customers', label: 'Customers', icon: Users },
  { href: '/dashboard/quotes', label: 'Quotes', icon: FileText },
  { href: '/dashboard/invoices', label: 'Invoices', icon: Receipt },
  { href: '/dashboard/insights', label: 'AI Insights', icon: Sparkles },
  { href: '/dashboard/activity', label: 'Activity', icon: Activity },
  { href: '/dashboard/expenses', label: 'Expenses', icon: Wallet },
  { href: '/dashboard/billing', label: 'Billing & Payments', icon: CreditCard },
  { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/** Shown on mobile bottom bar (primary); remaining items go in “More”. */
export const mobileBottomPrimaryHrefs = new Set<string>([
  '/dashboard',
  '/dashboard/assistant',
  '/dashboard/invoices',
]);

export const dashboardMoreNavItems: DashboardNavItem[] = dashboardNavItems.filter(
  (item) => !mobileBottomPrimaryHrefs.has(item.href)
);

export const dashboardMobileBottomPrimary: DashboardNavItem[] = dashboardNavItems.filter((item) =>
  mobileBottomPrimaryHrefs.has(item.href)
);

export function mobilePrimaryFromNavItems(navItems: DashboardNavItem[]): DashboardNavItem[] {
  return dashboardMobileBottomPrimary
    .map((p) => navItems.find((n) => n.href === p.href))
    .filter((x): x is DashboardNavItem => Boolean(x));
}

export function mobileMoreFromNavItems(navItems: DashboardNavItem[]): DashboardNavItem[] {
  return navItems.filter((item) => !mobileBottomPrimaryHrefs.has(item.href));
}

export type DashboardCreateAction = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function filterDashboardNavItems(
  items: DashboardNavItem[],
  f: PermissionFlags
): DashboardNavItem[] {
  return items.filter((item) => {
    switch (item.href) {
      case '/dashboard/create':
        return f.createInvoice || f.createCustomer || f.showExpensesWrite;
      case '/dashboard/assistant':
        return f.createInvoice;
      case '/settings':
        return f.showSettingsNav;
      case '/dashboard/billing':
        return f.showBillingNav;
      case '/dashboard/support':
        return f.showSupportNav;
      case '/dashboard/insights':
        return f.canUseAiInsights;
      case '/dashboard/expenses':
        return f.viewData;
      default:
        return f.viewData;
    }
  });
}

export function filterDashboardCreateActions(
  actions: DashboardCreateAction[],
  f: PermissionFlags
): DashboardCreateAction[] {
  return actions.filter((a) => {
    if (a.href === '/dashboard/create') {
      return f.createInvoice || f.createCustomer || f.showExpensesWrite;
    }
    if (a.href === '/dashboard/invoices/new') return f.createInvoice;
    if (a.href === '/dashboard/quotes/new') return f.createInvoice;
    if (a.href === '/dashboard/customers?add=1') return f.createCustomer;
    if (a.href === '/dashboard/expenses') return f.showExpensesWrite;
    return true;
  });
}

/** Create menu actions (aligned with dashboard quick actions). */
export const dashboardCreateActions: DashboardCreateAction[] = [
  { href: '/dashboard/create', label: 'Create', icon: PlusCircle },
  { href: '/dashboard/invoices/new', label: 'Create Invoice', icon: Receipt },
  { href: '/dashboard/quotes/new', label: 'Create Quote', icon: FileText },
  { href: '/dashboard/customers?add=1', label: 'Add Customer', icon: Users },
  { href: '/dashboard/expenses', label: 'Record Expense', icon: Wallet },
];

export function isMoreMenuActive(
  pathname: string,
  items: DashboardNavItem[] = dashboardMoreNavItems
): boolean {
  return items.some((item) => isNavActive(pathname, item.href));
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }
  if (href === '/dashboard/assistant') {
    return pathname === '/dashboard/assistant' || pathname.startsWith('/dashboard/assistant/');
  }
  if (href === '/settings') {
    return pathname.startsWith('/settings');
  }
  if (href === '/dashboard/support') {
    return pathname === '/dashboard/support' || pathname.startsWith('/dashboard/support/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
