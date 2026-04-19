/**
 * Deterministic parsing of invoice identifiers from user text (chat / commands).
 */

export type ParsedInvoiceReference = {
  /** Normalized literal for equality (lowercase, no spaces). */
  literalKey: string | null;
  /** Numeric value of the primary digit run (59 for INV-00059 or "59"). */
  numericValue: number | null;
};

const TRAILING_DIGITS = /(\d+)\s*$/;

export function extractInvoiceTrailingNumber(invoiceNumber: string): number | null {
  const t = String(invoiceNumber ?? '').trim();
  const m = t.match(TRAILING_DIGITS);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function normalizeInvoiceNumberKey(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Parse invoice reference from free text.
 * Supports INV-00059, inv-00059, #59, inv 59, or a lone numeric message.
 */
export function parseInvoiceReferenceFromText(text: string): ParsedInvoiceReference | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;

  const invMatch = raw.match(
    /\b(?:inv|invoice)\s*[#:.\-\s]*\s*(0*\d+)\b/i
  );
  if (invMatch) {
    const digits = invMatch[1];
    const num = parseInt(digits, 10);
    const token = invMatch[0].replace(/\s+/g, '');
    return {
      literalKey: normalizeInvoiceNumberKey(token),
      numericValue: Number.isFinite(num) ? num : null,
    };
  }

  const hashMatch = raw.match(/#\s*(0*\d+)\b/);
  if (hashMatch) {
    const digits = hashMatch[1];
    const num = parseInt(digits, 10);
    return {
      literalKey: normalizeInvoiceNumberKey(`#${digits}`),
      numericValue: Number.isFinite(num) ? num : null,
    };
  }

  if (/^\s*0*(\d+)\s*$/.test(raw)) {
    const m = raw.match(/^\s*0*(\d+)\s*$/);
    if (m) {
      const num = parseInt(m[1], 10);
      return {
        literalKey: null,
        numericValue: Number.isFinite(num) ? num : null,
      };
    }
  }

  return null;
}

export function invoiceRowMatchesReference(
  invoiceNumber: string,
  ref: ParsedInvoiceReference
): boolean {
  const key = normalizeInvoiceNumberKey(invoiceNumber);
  if (!key) return false;
  if (ref.literalKey) {
    if (key === ref.literalKey) return true;
    if (ref.literalKey.startsWith('#')) {
      const asInv = normalizeInvoiceNumberKey(`inv-${ref.literalKey.slice(1)}`);
      if (key === asInv) return true;
    }
  }
  if (ref.numericValue != null) {
    const tail = extractInvoiceTrailingNumber(invoiceNumber);
    if (tail != null && tail === ref.numericValue) return true;
  }
  return false;
}
