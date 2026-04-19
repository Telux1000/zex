import { parseInvoiceReferenceFromText } from '@/lib/invoices/invoice-reference';

export type InvoiceChatLookupIntent = 'edit_invoice' | 'view_invoice';

const CREATE_INVOICE_RE =
  /\b(create|draft|new|make|add|start|build|generate)\b(?=[\s\S]*\binvoice\b)/i;

/** Leading “create / new / … invoice” — do not treat as payment-only when both appear. */
function hasExplicitCreateInvoicePhrase(text: string): boolean {
  return /\b(create|draft|new|make|start|build)\s+(?:an\s+)?invoice\b/i.test(text);
}

/**
 * Recording a payment / marking an existing invoice paid (not starting the new-invoice wizard).
 * Kept in sync with payment-action detection in `assistant-invoice-resolve-intent`.
 */
export function textLooksLikeInvoicePaymentRecordingIntent(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (hasExplicitCreateInvoicePhrase(t)) return false;

  if (/\bmark\b/i.test(lower) && /\bas\s+paid\b/.test(lower) && /\binvoice\b/i.test(t)) return true;
  if (/\bmark\s+as\s+paid\b/.test(lower)) return true;
  if (/\bmark\s+paid\b/.test(lower) && /\binvoice\b/i.test(lower)) return true;
  if (/\brecord\s+(?:a\s+)?payment\b/.test(lower)) return true;
  if (/\badd\s+(?:a\s+)?payment\b/.test(lower)) return true;
  if (/\blog\s+(?:a\s+)?payment\b/.test(lower)) return true;
  if (/\bregister\s+(?:a\s+)?payment\b/.test(lower)) return true;
  if (/\bpaid\s+in\s+full\b/.test(lower) && /\binvoice\b/i.test(lower)) return true;
  if (/\binvoice\s+paid\b/.test(lower) || /\bpaid\s+invoice\b/.test(lower)) return true;

  return false;
}

const EDIT_INVOICE_RE =
  /\b(edit|change|update|modify|adjust|revise)\b(?=[\s\S]*\b(?:inv|invoice)\b)/i;

const VIEW_INVOICE_RE =
  /\b(open|view|show|see|display|pull\s+up|look\s+up|find)\b(?=[\s\S]*\b(?:inv|invoice)\b)/i;

/** True when the user is clearly starting the “new invoice” wizard, not lookup. */
export function textLooksLikeCreateInvoiceFlow(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (textLooksLikeInvoicePaymentRecordingIntent(t)) return false;
  return CREATE_INVOICE_RE.test(t);
}

/**
 * Explicit “start a new invoice for this customer” phrasing. When matched, the wizard should
 * clear any prior linked customer draft and parse this message as a fresh invoice (items + due
 * in the same turn must not inherit a completed invoice’s customerId).
 */
export function isExplicitNewInvoiceCreationMessage(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  return /\b(create|draft|new|make|start|build)\s+(an\s+)?invoice\s+for\b/i.test(t);
}

/** Bare “Create an invoice” / “Create invoice” with no payload — must start a clean draft, not auto-submit. */
export function isBareGenericCreateInvoiceMessage(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t || t.length > 120) return false;
  return /^(create|draft|new|make|start|build)\s+(an\s+)?invoice\s*[!?.]*\s*$/i.test(t);
}

/** Lead-in like “Invoice for Acme Corp, …” (new customer + details in one message). */
export function isInvoiceForCustomerLeadIn(text: string): boolean {
  const t = String(text ?? '').trim();
  if (t.length < 12) return false;
  const m = t.match(/^\s*invoice\s+for\s+(\S+)/i);
  if (!m?.[1]) return false;
  const first = m[1].replace(/[,;]$/, '').toLowerCase();
  const ambiguous = new Set(['payment', 'the', 'this', 'that', 'my', 'your', 'our', 'me', 'you']);
  if (ambiguous.has(first)) return false;
  return true;
}

/** Any intent that must discard a prior completed/stale draft before parsing this turn. */
export function shouldResetDraftForNewInvoiceIntent(text: string): boolean {
  return (
    isExplicitNewInvoiceCreationMessage(text) ||
    isBareGenericCreateInvoiceMessage(text) ||
    isInvoiceForCustomerLeadIn(text)
  );
}

/**
 * Detect view vs edit intent. Returns null when the message is not about invoice lookup.
 */
export function detectInvoiceLookupIntent(text: string): InvoiceChatLookupIntent | null {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (textLooksLikeCreateInvoiceFlow(t)) return null;

  if (EDIT_INVOICE_RE.test(t)) return 'edit_invoice';
  if (VIEW_INVOICE_RE.test(t)) return 'view_invoice';

  if (/\binvoice\b/i.test(t) && parseInvoiceReferenceFromText(t)) {
    return 'view_invoice';
  }

  if (/\b(edit|change|update|modify)\s+(this|that|the)\s+invoice\b/i.test(t)) {
    return 'edit_invoice';
  }

  return null;
}

/**
 * Extract structured reference if present; intent may still be null (caller uses pending intent).
 */
export function extractInvoiceRefForLookup(text: string): ReturnType<typeof parseInvoiceReferenceFromText> {
  return parseInvoiceReferenceFromText(text);
}
