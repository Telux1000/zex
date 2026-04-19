export type MatchableCustomer = {
  id: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  preferred_currency_code?: string | null;
};

export type CustomerMatchConfidence = 'high' | 'medium' | 'low';

export type CustomerMatchDisambiguation = 'duplicate_exact' | 'fuzzy_partial';

export type CustomerMatchResult = {
  match: MatchableCustomer | null;
  matches: MatchableCustomer[];
  confidence: CustomerMatchConfidence;
  /** When user confirmation is required before linking (never auto-select on `fuzzy_partial`). */
  disambiguation?: CustomerMatchDisambiguation;
};

const COMPANY_SUFFIX_RE = /\b(ltd|limited|llc|inc|corp|corporation|plc|co|company)\b/g;
const INVALID_GENERIC_TERMS = new Set(['invoice', 'client', 'company', 'customer']);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(COMPANY_SUFFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalCustomerName(c: MatchableCustomer): string {
  return String(c.company || c.name || '').trim();
}

/** Stable first occurrence wins — fixes duplicate rows / joins surfacing the same customer twice. */
export function dedupeMatchableCustomersById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of list) {
    const id = String(c.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

export function isInvalidGenericCustomerName(value: string): boolean {
  const norm = normalize(String(value ?? ''));
  return !norm || INVALID_GENERIC_TERMS.has(norm);
}

export function matchCustomerFromText(
  inputText: string,
  customersList: MatchableCustomer[]
): CustomerMatchResult {
  const customers = dedupeMatchableCustomersById(customersList ?? []);
  const textNorm = normalize(String(inputText ?? ''));
  if (!textNorm || isInvalidGenericCustomerName(textNorm) || customers.length === 0) {
    return { match: null, matches: [], confidence: 'low' };
  }

  const exact = customers.filter((c) => {
    const n = normalize(canonicalCustomerName(c));
    return Boolean(n) && n === textNorm;
  });
  if (exact.length === 1) {
    return { match: exact[0], matches: exact, confidence: 'high' };
  }
  if (exact.length > 1) {
    return {
      match: null,
      matches: exact.slice(0, 8),
      confidence: 'medium',
      disambiguation: 'duplicate_exact',
    };
  }

  const partial = customers.filter((c) => {
    const n = normalize(canonicalCustomerName(c));
    if (!n) return false;
    return (
      textNorm.includes(n) ||
      n.includes(textNorm) ||
      n.startsWith(textNorm) ||
      textNorm.startsWith(n)
    );
  });

  if (partial.length > 1) {
    return {
      match: null,
      matches: partial.slice(0, 8),
      confidence: 'medium',
      disambiguation: 'fuzzy_partial',
    };
  }
  if (partial.length === 1) {
    const only = partial[0];
    const n = normalize(canonicalCustomerName(only));
    if (n && (textNorm === n || textNorm.includes(n) || n.includes(textNorm))) {
      /**
       * Non-exact string match (substring / prefix overlap): never auto-link — require confirmation.
       * Only normalized equality in `exact` above yields `confidence: high`.
       */
      return {
        match: null,
        matches: [only],
        confidence: 'medium',
        disambiguation: 'fuzzy_partial',
      };
    }
  }

  return { match: null, matches: [], confidence: 'low' };
}

/**
 * Match using the parsed customer name alone first so "Lava LLC" can exact-match a stored
 * customer even when the full prompt is long. Falls back to name + full text if needed.
 */
export function resolveCustomerMatchFromAiInput(
  parsedCustomerName: string,
  fullText: string,
  customersList: MatchableCustomer[]
): CustomerMatchResult {
  const name = String(parsedCustomerName ?? '').trim();
  const customers = dedupeMatchableCustomersById(customersList ?? []);
  if (name) {
    const byName = matchCustomerFromText(name, customers);
    if (byName.confidence === 'high' && byName.match) {
      return byName;
    }
  }
  const matchText = name ? `${name} ${fullText}` : fullText;
  return matchCustomerFromText(matchText, customers);
}

/**
 * When two saved customers share the same display label, disambiguate for the picker (trust UX).
 */
export function disambiguateCustomerSuggestionLabels<T extends { id: string; label: string; email: string | null }>(
  suggestions: T[]
): T[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const s of suggestions) {
    const k = norm(s.label);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return suggestions.map((s) => {
    if ((counts.get(norm(s.label)) ?? 0) <= 1) return s;
    const em = s.email?.trim();
    return em ? ({ ...s, label: `${s.label} (${em})` } as T) : s;
  });
}
