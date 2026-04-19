import type { SupabaseClient } from '@supabase/supabase-js';
import {
  matchCustomerFromText,
  type MatchableCustomer,
  type CustomerMatchResult,
} from '@/lib/customers/match-from-text';

export type AssistantCustomerFindRow = {
  id: string;
  display_name: string;
  email: string | null;
};

function toDisplayName(c: MatchableCustomer): string {
  return String(c.company || c.name || c.email || 'Customer').trim() || 'Customer';
}

function toFindRow(c: MatchableCustomer): AssistantCustomerFindRow {
  return {
    id: String(c.id),
    display_name: toDisplayName(c),
    email: c.email != null && String(c.email).trim() ? String(c.email).trim() : null,
  };
}

function normalizeForSimilarity(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

/** Similarity in [0, 1] — ratio based on Levenshtein distance vs max length. */
export function stringSimilarityRatio(a: string, b: string): number {
  const A = normalizeForSimilarity(a);
  const B = normalizeForSimilarity(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const maxLen = Math.max(A.length, B.length);
  const d = levenshtein(A, B);
  let ratio = 1 - d / maxLen;
  const longer = A.length >= B.length ? A : B;
  const shorter = A.length >= B.length ? B : A;
  if (shorter.length >= 3 && longer.includes(shorter)) {
    ratio = Math.max(ratio, 0.45);
  }
  return ratio;
}

function bestNameScore(query: string, c: MatchableCustomer): number {
  const disp = toDisplayName(c);
  const parts = [disp, String(c.company ?? '').trim(), String(c.name ?? '').trim()].filter(Boolean);
  let best = 0;
  for (const p of parts) {
    best = Math.max(best, stringSimilarityRatio(query, p));
  }
  return best;
}

/**
 * When exact structured matching finds nothing, suggest close names (minRatio default 0.3).
 */
export async function suggestCustomersBySimilarity(
  supabase: SupabaseClient,
  businessId: string,
  query: string,
  opts?: { minRatio?: number; limit?: number }
): Promise<AssistantCustomerFindRow[]> {
  const q = String(query ?? '').trim();
  const minRatio = opts?.minRatio ?? 0.3;
  const limit = Math.min(8, Math.max(1, opts?.limit ?? 5));
  if (!q) return [];

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, company, email, phone')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error || !data?.length) return [];

  const scored = (data as MatchableCustomer[])
    .map((c) => ({ c, score: bestNameScore(q, c) }))
    .filter((x) => x.score >= minRatio)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((x) => toFindRow(x.c));
}

/**
 * Resolve customers by free-text name for the assistant (DB + fuzzy match).
 * Used by chat routing and the `find_customer` tool.
 */
export async function findCustomerRecordsByName(
  supabase: SupabaseClient,
  businessId: string,
  name: string
): Promise<{ result: CustomerMatchResult; rows: AssistantCustomerFindRow[] }> {
  const q = String(name ?? '').trim();
  if (!q) {
    return { result: { match: null, matches: [], confidence: 'low' }, rows: [] };
  }

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, company, email, phone')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(280);

  if (error || !data?.length) {
    return { result: { match: null, matches: [], confidence: 'low' }, rows: [] };
  }

  const list = data as MatchableCustomer[];
  const result = matchCustomerFromText(q, list);

  if (result.confidence === 'high' && result.match) {
    return { result, rows: [toFindRow(result.match)] };
  }
  if (result.matches.length > 0) {
    return { result, rows: result.matches.map(toFindRow) };
  }
  return { result, rows: [] };
}

function normalizeExactMatchKey(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
}

/**
 * Exact (case-insensitive) match on company, contact name, or display label — for create-customer flow only.
 * Does not use fuzzy / medium-confidence matching.
 */
export async function findCustomerRecordsExactNameMatch(
  supabase: SupabaseClient,
  businessId: string,
  name: string
): Promise<AssistantCustomerFindRow[]> {
  const q = normalizeExactMatchKey(name);
  if (!q) return [];

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, company, email, phone')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error || !data?.length) return [];

  const matches: AssistantCustomerFindRow[] = [];
  for (const c of data as MatchableCustomer[]) {
    const company = normalizeExactMatchKey(String(c.company ?? ''));
    const contact = normalizeExactMatchKey(String(c.name ?? ''));
    const disp = normalizeExactMatchKey(toDisplayName(c));
    if (
      (company.length > 0 && company === q) ||
      (contact.length > 0 && contact === q) ||
      (disp.length > 0 && disp === q)
    ) {
      matches.push(toFindRow(c));
    }
  }
  return matches;
}

/** Alias for tool naming. */
export const find_customer = findCustomerRecordsByName;
