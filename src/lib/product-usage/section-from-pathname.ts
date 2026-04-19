import type { PageSectionKey } from '@/lib/product-usage/allowed-keys';

/**
 * Map dashboard URL path to a coarse section key for analytics (first matching prefix wins).
 */
export function pageSectionKeyFromPathname(pathname: string): PageSectionKey | null {
  if (!pathname.startsWith('/dashboard')) return null;
  const path = pathname.replace(/\/$/, '') || '/dashboard';

  const rules: [string, PageSectionKey][] = [
    ['/dashboard/assistant', 'assistant'],
    ['/dashboard/support', 'support'],
    ['/dashboard/invoices', 'invoices'],
    ['/dashboard/customers', 'customers'],
    ['/dashboard/analytics', 'analytics'],
    ['/dashboard/billing', 'billing'],
    ['/dashboard/activity', 'activity'],
    ['/dashboard/expenses', 'expenses'],
    ['/dashboard/quotes', 'quotes'],
    ['/dashboard/insights', 'insights'],
    ['/dashboard/create', 'create'],
  ];

  for (const [prefix, key] of rules) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }

  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return 'dashboard';
  }

  return null;
}
