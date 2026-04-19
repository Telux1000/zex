import type { InvoiceWizardDraft } from './types';

export function normalizeAddressWhitespace(s: string): string {
  return String(s ?? '').replace(/[\s\u00a0\t\n\r]+/g, ' ').trim();
}

/**
 * Collapse duplicate line1 / freeform address; keep one canonical line1 for storage and display.
 */
export function dedupeWizardAddressFields(draft: InvoiceWizardDraft): InvoiceWizardDraft {
  const a1Raw =
    draft.customerAddressLine1 != null ? normalizeAddressWhitespace(String(draft.customerAddressLine1)) : '';
  const adRaw =
    draft.customerAddress != null ? normalizeAddressWhitespace(String(draft.customerAddress)) : '';
  const L = a1Raw || '';
  const A = adRaw || '';

  if (!L && !A) {
    return {
      ...draft,
      customerAddressLine1: null,
      customerAddress: null,
    };
  }
  if (!L) {
    return { ...draft, customerAddressLine1: A, customerAddress: null };
  }
  if (!A) {
    return { ...draft, customerAddressLine1: L, customerAddress: null };
  }
  if (L === A) {
    return { ...draft, customerAddressLine1: L, customerAddress: null };
  }
  if (L.includes(A) || A.includes(L)) {
    const longer = L.length >= A.length ? L : A;
    return { ...draft, customerAddressLine1: longer, customerAddress: null };
  }
  return { ...draft, customerAddressLine1: L, customerAddress: A };
}
