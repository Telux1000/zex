export type IndustryOption = {
  key: string;
  label: string;
};

export const INDUSTRY_OTHER_KEY = 'other';

export const INDUSTRY_OPTIONS: IndustryOption[] = [
  { key: 'freelancer_independent', label: 'Freelancer / Independent' },
  { key: 'creator_influencer', label: 'Creator / Influencer' },
  { key: 'it_services_consulting', label: 'IT Services & Consulting' },
  { key: 'marketing_advertising', label: 'Marketing & Advertising' },
  { key: 'media_entertainment', label: 'Media & Entertainment' },
  { key: 'consultancy_services', label: 'Consultancy Services' },
  { key: 'legal_services', label: 'Legal Services' },
  { key: 'startup', label: 'Startup' },
  { key: 'software_saas', label: 'Software / SaaS' },
  { key: 'ai_data_machine_learning', label: 'AI / Data / Machine Learning' },
  { key: 'cybersecurity', label: 'Cybersecurity' },
  { key: 'fintech', label: 'Fintech' },
  { key: 'edtech', label: 'EdTech' },
  { key: 'healthtech', label: 'HealthTech' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'marketplace_platform', label: 'Marketplace / Platform' },
  { key: 'accounting_finance_services', label: 'Accounting & Finance Services' },
  { key: 'aerospace_defence', label: 'Aerospace & Defence' },
  { key: 'agriculture', label: 'Agriculture' },
  { key: 'art_architecture_design', label: 'Art, Architecture & Design' },
  { key: 'automotive', label: 'Automotive' },
  { key: 'banking', label: 'Banking' },
  { key: 'education', label: 'Education' },
  { key: 'energy_utilities_resources', label: 'Energy, Utilities & Resources' },
  { key: 'food_beverages', label: 'Food & Beverages' },
  { key: 'government_public_services', label: 'Government & Public Services' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'hr_related_services', label: 'HR & Related Services' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'it_hardware', label: 'IT Hardware' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'non_profit', label: 'Non-Profit' },
  { key: 'pharma_life_sciences', label: 'Pharma & Life Sciences' },
  { key: 'professional_services', label: 'Professional Services' },
  { key: 'real_estate_construction', label: 'Real Estate & Construction' },
  { key: 'retail_ecommerce', label: 'Retail & E-Commerce' },
  { key: 'telecommunications', label: 'Telecommunications' },
  { key: 'transportation_logistics', label: 'Transportation & Logistics' },
  { key: 'travel_hospitality', label: 'Travel & Hospitality' },
  { key: INDUSTRY_OTHER_KEY, label: 'Others' },
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
