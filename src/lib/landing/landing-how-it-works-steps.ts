export const LANDING_HOW_IT_WORKS_STEPS = [
  {
    n: 1,
    title: 'Set up your workspace',
    body: "Sign up, add your business details, and you're ready to invoice, no setup headaches.",
  },
  {
    n: 2,
    title: 'Create invoices in seconds',
    body: 'Create invoices your way from text, voice, manual entry, or screenshots in seconds.',
  },
  {
    n: 3,
    title: 'Get paid and stay in control',
    body: "Track what's paid or overdue in real time, and let automatic reminders handle the follow-up.",
  },
] as const;

/** Short titles for narrow viewports (stacked, no accordion). */
export const LANDING_HOW_IT_WORKS_COMPACT = [
  { n: 1 as const, title: 'Create invoice', body: 'Add clients, line items, and taxes in minutes.' },
  { n: 2 as const, title: 'Send automatically', body: 'Professional invoices with payment links and smart reminders.' },
  { n: 3 as const, title: 'Get paid faster', body: 'Track status and let follow-ups run in the background.' },
] as const;
