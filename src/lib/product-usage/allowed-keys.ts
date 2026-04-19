/** Allowlisted keys for POST /api/product-usage/track (avoid arbitrary strings). */

export const PAGE_SECTION_KEYS = [
  'dashboard',
  'invoices',
  'customers',
  'analytics',
  'billing',
  'activity',
  'expenses',
  'quotes',
  'insights',
  'assistant',
  'support',
  'create',
] as const;

export type PageSectionKey = (typeof PAGE_SECTION_KEYS)[number];

export const PAGE_SECTION_LABELS: Record<PageSectionKey, string> = {
  dashboard: 'Dashboard',
  invoices: 'Invoices',
  customers: 'Customers',
  analytics: 'Analytics',
  billing: 'Billing',
  activity: 'Activity',
  expenses: 'Expenses',
  quotes: 'Quotes',
  insights: 'Insights',
  assistant: 'AI assistant',
  support: 'Support',
  create: 'Create / wizard',
};

export const FEATURE_USAGE_KEYS = ['ai_assistant', 'reminders', 'scheduled_send', 'invoice_create'] as const;

export type FeatureUsageKey = (typeof FEATURE_USAGE_KEYS)[number];

export function isAllowedPageSectionKey(k: string): k is PageSectionKey {
  return (PAGE_SECTION_KEYS as readonly string[]).includes(k);
}

export function isAllowedFeatureKey(k: string): k is FeatureUsageKey {
  return (FEATURE_USAGE_KEYS as readonly string[]).includes(k);
}
