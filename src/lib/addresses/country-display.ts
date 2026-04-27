/**
 * Display-only shortening of verbose official country names for invoice/quote UI and PDF.
 * Does not change stored data; call at render time only.
 */
export function formatCountryDisplayName(raw: string | null | undefined): string {
  if (raw == null) return '';
  const t = String(raw).trim();
  if (!t) return '';
  const n = t.toLowerCase().replace(/\s+/g, ' ');

  const table: Record<string, string> = {
    'united kingdom of great britain and northern ireland': 'United Kingdom',
    'united states of america': 'United States',
    'united states of america (the)': 'United States',
    'russian federation': 'Russia',
    'republic of south africa': 'South Africa',
    'united arab emirates': 'UAE',
  };

  if (table[n]) return table[n];
  if (n.startsWith('united kingdom of great britain')) return 'United Kingdom';
  if (n.startsWith('united states of america')) return 'United States';

  return t;
}
