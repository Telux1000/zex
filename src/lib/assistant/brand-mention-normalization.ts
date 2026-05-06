type BrandNormalizationMatch = {
  from: string;
  to: 'zenzex';
};

type NormalizeAssistantBrandMentionsResult = {
  normalizedText: string;
  matches: BrandNormalizationMatch[];
};

const BRAND_VARIANT_RULES: Array<{ pattern: RegExp; canonical: 'zenzex' }> = [
  { pattern: /\bzenzek\b/gi, canonical: 'zenzex' },
  { pattern: /\bzen\s+zex\b/gi, canonical: 'zenzex' },
  { pattern: /\bzen\s+sex\b/gi, canonical: 'zenzex' },
  { pattern: /\bzensex\b/gi, canonical: 'zenzex' },
  { pattern: /\bzenzecks\b/gi, canonical: 'zenzex' },
  { pattern: /\bzenzeks\b/gi, canonical: 'zenzex' },
];

/**
 * Normalize common brand wake-word transcription variants for command routing only.
 * Do not use this to mutate persisted invoice/customer/business content.
 */
export function normalizeAssistantBrandMentionsForRouting(
  input: string
): NormalizeAssistantBrandMentionsResult {
  let normalizedText = input;
  const matches: BrandNormalizationMatch[] = [];

  for (const rule of BRAND_VARIANT_RULES) {
    normalizedText = normalizedText.replace(rule.pattern, (matched) => {
      matches.push({ from: matched.toLowerCase(), to: rule.canonical });
      return rule.canonical;
    });
  }

  return { normalizedText, matches };
}

