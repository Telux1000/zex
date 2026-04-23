export type IndustryOption = {
  key: string;
  label: string;
};

export const INDUSTRY_OTHER_KEY = 'other';

export const INDUSTRY_OPTIONS: IndustryOption[] = [
  { key: 'software_saas', label: 'Software / SaaS' },
  { key: 'ecommerce', label: 'E-commerce' },
  { key: 'retail', label: 'Retail' },
  { key: 'professional_services', label: 'Professional Services' },
  { key: 'marketing_agency', label: 'Marketing / Agency' },
  { key: 'education', label: 'Education' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'finance', label: 'Finance' },
  { key: 'real_estate', label: 'Real Estate' },
  { key: 'hospitality', label: 'Hospitality' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'nonprofit', label: 'Nonprofit' },
  { key: 'government', label: 'Government' },
  { key: 'media', label: 'Media' },
  { key: INDUSTRY_OTHER_KEY, label: 'Other' },
];

const INDUSTRY_KEY_TO_LABEL = new Map(INDUSTRY_OPTIONS.map((opt) => [opt.key, opt.label]));

export function getIndustryLabelFromKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return INDUSTRY_KEY_TO_LABEL.get(key) ?? null;
}

export function isKnownIndustryKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return INDUSTRY_KEY_TO_LABEL.has(key);
}
