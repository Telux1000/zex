import { z } from 'zod';

export const INVOICE_TEMPLATE_IDS = ['classic', 'modern', 'minimal', 'bold', 'elegant'] as const;
export type InvoiceTemplateId = (typeof INVOICE_TEMPLATE_IDS)[number];

const idSet: ReadonlySet<string> = new Set(INVOICE_TEMPLATE_IDS);

export const invoiceTemplateIdSchema = z.enum(INVOICE_TEMPLATE_IDS);

export function isInvoiceTemplateId(s: string | null | undefined): s is InvoiceTemplateId {
  return s != null && idSet.has(String(s).toLowerCase().trim());
}

/** Unknown or empty values fall back to classic. */
export function normalizeInvoiceTemplateId(
  s: string | null | undefined
): InvoiceTemplateId {
  const t = String(s ?? '').toLowerCase().trim();
  return isInvoiceTemplateId(t) ? t : 'classic';
}
