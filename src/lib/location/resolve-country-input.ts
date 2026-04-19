import { countries as isoCountries, type CountryOption } from '@/lib/location/countries';
import { normalizeCountryCode } from '@/lib/location/normalizeCountryCode';

/** Lowercased keys → ISO alpha-2. Extends normalizeCountryCode aliases for fuzzy pipeline. */
export const COUNTRY_INPUT_ALIASES: Record<string, string> = {
  usa: 'US',
  america: 'US',
  uae: 'AE',
  uk: 'GB',
  britain: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  holland: 'NL',
  korea: 'KR',
  'south korea': 'KR',
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}

function scoreMatch(rawInput: string, c: CountryOption): number {
  const q0 = rawInput.trim().toLowerCase().replace(/^the\s+/i, '').trim();
  if (!q0) return 0;
  const name = c.name.toLowerCase();
  const code = c.code.toLowerCase();

  if (q0 === code) return 100;
  if (q0 === name) return 100;

  const alias = COUNTRY_INPUT_ALIASES[q0];
  if (alias === c.code) return 100;

  if (name.startsWith(q0)) {
    return q0.length <= 2 ? 78 : 88 + Math.min(12, Math.floor(q0.length / 2));
  }

  if (q0.length >= 3 && name.includes(q0)) {
    return 72;
  }

  const qWords = q0.split(/\s+/).filter(Boolean);
  const nameWords = name.split(/[^a-z0-9]+/).filter(Boolean);
  if (qWords.length > 0 && qWords.every((w) => nameWords.some((nw) => nw === w || nw.startsWith(w)))) {
    return 84;
  }

  const dist = levenshtein(q0, name);
  const maxLen = Math.max(q0.length, name.length, 1);
  const ratio = 1 - dist / maxLen;
  return Math.max(0, ratio * 92);
}

export type CountryResolution =
  | { tier: 'high'; code: string; name: string }
  | { tier: 'medium'; candidates: Array<{ code: string; name: string }> }
  | { tier: 'low' };

const HIGH_MIN = 90;
const MEDIUM_MIN = 62;
const GAP_FOR_HIGH = 10;

/**
 * Fuzzy country resolution for natural chat input (abbreviations, partial names, casing).
 */
export function resolveCountryFromUserText(input: string): CountryResolution {
  const raw = String(input ?? '').trim();
  if (!raw) return { tier: 'low' };

  const direct = normalizeCountryCode(raw);
  if (direct) {
    const name = isoCountries.find((c) => c.code === direct)?.name ?? direct;
    return { tier: 'high', code: direct, name };
  }

  const lowered = raw.toLowerCase();
  const aliasCode = COUNTRY_INPUT_ALIASES[lowered];
  if (aliasCode) {
    const name = isoCountries.find((c) => c.code === aliasCode)?.name ?? aliasCode;
    return { tier: 'high', code: aliasCode, name };
  }

  const scored = isoCountries
    .map((c) => ({ c, s: scoreMatch(raw, c) }))
    .filter((x) => x.s >= MEDIUM_MIN)
    .sort((a, b) => b.s - a.s);

  if (scored.length === 0) return { tier: 'low' };

  const best = scored[0]!;
  const second = scored[1];

  if (best.s >= HIGH_MIN && (!second || best.s - second.s >= GAP_FOR_HIGH)) {
    return { tier: 'high', code: best.c.code, name: best.c.name };
  }

  const close = scored.filter((x) => x.s >= MEDIUM_MIN && x.s >= best.s - 12).slice(0, 4);
  if (close.length >= 1) {
    return {
      tier: 'medium',
      candidates: close.map((x) => ({ code: x.c.code, name: x.c.name })),
    };
  }

  return { tier: 'low' };
}

/** Match user reply when we previously offered a shortlist (by code or name). */
export function resolveCountryAgainstCandidates(
  input: string,
  candidateCodes: string[]
): CountryResolution {
  const raw = String(input ?? '').trim();
  if (!raw) return { tier: 'low' };
  const codeList = candidateCodes.map((c) => c.toUpperCase());
  const set = new Set(codeList);
  const direct = normalizeCountryCode(raw);
  if (direct && set.has(direct)) {
    const name = isoCountries.find((c) => c.code === direct)?.name ?? direct;
    return { tier: 'high', code: direct, name };
  }
  const lowered = raw.toLowerCase();
  for (const code of codeList) {
    const opt = isoCountries.find((c) => c.code === code);
    if (!opt) continue;
    if (opt.name.toLowerCase() === lowered) return { tier: 'high', code: opt.code, name: opt.name };
    if (opt.name.toLowerCase().startsWith(lowered) && lowered.length >= 3) {
      return { tier: 'high', code: opt.code, name: opt.name };
    }
  }
  return resolveCountryFromUserText(raw);
}

export function countryDisplayNameFromIso(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const u = code.trim().toUpperCase();
  return isoCountries.find((c) => c.code === u)?.name ?? null;
}

/**
 * Persisted shape: full English name + ISO code (never store ambiguous free text alone).
 */
export function countryFieldsForStorageFromIso(code: string): { country: string; country_code: string } {
  const c = code.trim().toUpperCase();
  const name = isoCountries.find((x) => x.code === c)?.name ?? c;
  return { country: name, country_code: c };
}

export function flagEmojiFromIso(code: string | null | undefined): string {
  const raw = String(code ?? '').trim().toUpperCase();
  if (!raw) return '';
  /** Non-ISO alias: "UK" encodes as U+1F1FA + U+1F1F0 (wrong flag); United Kingdom is GB. */
  const iso2 = raw === 'UK' ? 'GB' : raw;
  if (iso2.length !== 2) return '';
  const A = 0x1f1e6;
  const out: string[] = [];
  for (let i = 0; i < 2; i++) {
    const cp = iso2.codePointAt(i);
    if (cp == null || cp < 65 || cp > 90) return '';
    out.push(String.fromCodePoint(A + (cp - 65)));
  }
  return out.join('');
}
