import type { LucideIcon } from 'lucide-react';
import { BarChart3, Bell, CreditCard, FileText } from 'lucide-react';

export type LandingFeatureDef = {
  title: string;
  body: string;
  Icon: LucideIcon;
};

/** Full grid on `sm+` — unchanged for desktop. */
export const LANDING_FEATURE_ITEMS: LandingFeatureDef[] = [
  {
    title: 'Create invoices from text, voice, or uploads — then review before sending',
    body: 'Create invoices in seconds — then review and confirm before sending.',
    Icon: FileText,
  },
  {
    title: 'Real-time payment tracking',
    body: "See what's paid, partial, or overdue at a glance. One clear view of your receivables.",
    Icon: CreditCard,
  },
  {
    title: 'Automated reminders (you choose when they’re sent)',
    body: 'Send polite, timely reminders and schedule follow-ups while you stay in control of timing and recipients.',
    Icon: Bell,
  },
  {
    title: 'Built-in insights',
    body: 'Clear summaries and reporting so you can see revenue trends and outstanding balances at a glance.',
    Icon: BarChart3,
  },
];

/** First three feature cards on narrow viewports. */
export const LANDING_FEATURE_ITEMS_MOBILE_PRIMARY: LandingFeatureDef[] = [
  {
    title: 'Create invoices in seconds',
    body: 'Turn quotes and line items into polished invoices with smart assisted drafts you can review before sending.',
    Icon: FileText,
  },
  {
    title: 'Get paid faster with reminders',
    body: 'Send reminders and follow-ups on your schedule so clients stay on track.',
    Icon: Bell,
  },
  {
    title: 'Track revenue in real time',
    body: 'See paid, pending, and overdue balances in one clear view of your cashflow.',
    Icon: BarChart3,
  },
];

/** Extra cards inside “View all features” on mobile. */
export const LANDING_FEATURE_ITEMS_MOBILE_MORE: LandingFeatureDef[] = [
  {
    title: 'Flexible inputs',
    body: 'Text, voice, manual entry, or screenshots—create invoices the way you already work.',
    Icon: FileText,
  },
  {
    title: 'Real-time payment tracking',
    body: "See what's paid, partial, or overdue at a glance. One clear view of your receivables.",
    Icon: CreditCard,
  },
  {
    title: 'Built-in insights',
    body: 'Summaries and reporting so revenue trends and outstanding balances stay visible.',
    Icon: BarChart3,
  },
];
