import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  LifeBuoy,
  BarChart3,
  Shield,
  UserCircle,
  UsersRound,
  Settings,
} from 'lucide-react';

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

/** Primary operations navigation (order matches product IA). */
export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Overview', description: 'Console home and shortcuts.', icon: LayoutDashboard },
  { href: '/admin/accounts', label: 'Accounts', description: 'Subscriber businesses and usage.', icon: Building2 },
  { href: '/admin/users', label: 'Users', description: 'Subscriber logins, roles, and access.', icon: UserCircle },
  { href: '/admin/billing', label: 'Billing', description: 'Plans, payments, Stripe sync.', icon: CreditCard },
  { href: '/admin/support', label: 'Support', description: 'Support tickets and triage.', icon: LifeBuoy },
  { href: '/admin/analytics', label: 'Analytics', description: 'Adoption and platform metrics.', icon: BarChart3 },
  {
    href: '/admin/security',
    label: 'Security',
    description: 'Access posture, audit activity, and owner policies.',
    icon: Shield,
  },
  { href: '/admin/team', label: 'Team', description: 'Internal Zenzex staff and invites.', icon: UsersRound },
  {
    href: '/admin/settings',
    label: 'Settings',
    description: 'Back-office and platform configuration.',
    icon: Settings,
  },
];

export type AdminBreadcrumbItem = { label: string; href?: string };

export function getAdminNavMeta(pathname: string): {
  title: string;
  description: string;
  breadcrumb?: AdminBreadcrumbItem[];
} {
  const normalized = pathname.replace(/\/$/, '') || '/admin';

  if (normalized === '/admin/profile') {
    return {
      title: 'Profile',
      description: 'Your Zenzex back-office identity and session.',
      breadcrumb: [{ label: 'Admin', href: '/admin' }, { label: 'Profile' }],
    };
  }

  if (/^\/admin\/accounts\/[^/]+$/.test(normalized) && normalized !== '/admin/accounts') {
    return {
      title: 'Account',
      description: 'Members, roles, and invites for this subscriber account.',
      breadcrumb: [
        { label: 'Admin', href: '/admin' },
        { label: 'Accounts', href: '/admin/accounts' },
        { label: 'Account' },
      ],
    };
  }

  if (/^\/admin\/support\/[^/]+$/.test(normalized) && normalized !== '/admin/support') {
    return {
      title: 'Ticket',
      description: 'Conversation and status for this support ticket.',
      breadcrumb: [
        { label: 'Admin', href: '/admin' },
        { label: 'Support', href: '/admin/support' },
        { label: 'Ticket' },
      ],
    };
  }

  const exact = ADMIN_NAV.find((n) => n.href === normalized);
  if (exact) {
    return {
      title: exact.label,
      description: exact.description,
      breadcrumb: [{ label: 'Admin', href: '/admin' }, { label: exact.label }],
    };
  }
  const prefix = [...ADMIN_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => normalized.startsWith(n.href + '/'));
  if (prefix) {
    return {
      title: prefix.label,
      description: prefix.description,
      breadcrumb: [{ label: 'Admin', href: '/admin' }, { label: prefix.label }],
    };
  }
  return { title: 'Admin', description: '', breadcrumb: [{ label: 'Admin', href: '/admin' }] };
}
