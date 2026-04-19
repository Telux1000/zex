import { isSupportedCurrency } from '@/lib/currency/supported';

const SYMBOL_TO_CODE: Array<{ symbol: string; code: string }> = [
  { symbol: '€', code: 'EUR' },
  { symbol: '$', code: 'USD' },
  { symbol: '£', code: 'GBP' },
  { symbol: '¥', code: 'JPY' },
  { symbol: '₦', code: 'NGN' },
  { symbol: '₵', code: 'GHS' },
  { symbol: 'R', code: 'ZAR' },
];

const WORD_TO_CODE: Array<{ word: string; code: string }> = [
  { word: 'pound sterling', code: 'GBP' },
  { word: 'us dollars', code: 'USD' },
  { word: 'us dollar', code: 'USD' },
  { word: 'canadian dollars', code: 'CAD' },
  { word: 'canadian dollar', code: 'CAD' },
  { word: 'australian dollars', code: 'AUD' },
  { word: 'australian dollar', code: 'AUD' },
  { word: 'swiss francs', code: 'CHF' },
  { word: 'swiss franc', code: 'CHF' },
  { word: 'dollars', code: 'USD' },
  { word: 'dollar', code: 'USD' },
  { word: 'euros', code: 'EUR' },
  { word: 'euro', code: 'EUR' },
  { word: 'pounds', code: 'GBP' },
  { word: 'pound', code: 'GBP' },
  { word: 'naira', code: 'NGN' },
  { word: 'yen', code: 'JPY' },
  { word: 'cedis', code: 'GHS' },
  { word: 'cedi', code: 'GHS' },
  { word: 'rand', code: 'ZAR' },
];

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=_`~()@+\-?<>[\]\\|"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectCurrencyFromText(text: string): string | null {
  const raw = String(text ?? '');
  if (!raw.trim()) return null;

  for (const item of SYMBOL_TO_CODE) {
    if (raw.includes(item.symbol)) return item.code;
  }

  const upper = raw.toUpperCase();
  const isoMatches = upper.match(/\b[A-Z]{3}\b/g) ?? [];
  for (const token of isoMatches) {
    if (isSupportedCurrency(token)) return token;
  }

  const normalized = normalizeText(raw);
  for (const item of WORD_TO_CODE) {
    const pattern = new RegExp(`\\b${item.word.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (pattern.test(normalized)) return item.code;
  }

  return null;
}
