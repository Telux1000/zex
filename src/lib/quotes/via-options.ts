export const QUOTE_DECISION_VIA_VALUES = [
  'email',
  'whatsapp',
  'phone_verbal',
  'in_person',
  'external_system',
  'other',
  'manual',
] as const;

export type QuoteDecisionVia = (typeof QUOTE_DECISION_VIA_VALUES)[number];

export const QUOTE_DECISION_VIA_LABELS: Record<QuoteDecisionVia, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  phone_verbal: 'Phone / Verbal',
  in_person: 'In Person',
  external_system: 'External System',
  other: 'Other',
  manual: 'Manual',
};
