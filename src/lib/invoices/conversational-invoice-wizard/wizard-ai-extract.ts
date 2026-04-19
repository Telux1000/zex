import { z } from 'zod';
import { extractEmailAddress } from '@/lib/utils/email';

/**
 * Lenient extraction schema for the invoice chat wizard only.
 * Allows empty items and partial line rows; strict `parsedInvoiceSchema` is reserved for final create.
 */
const wizardLineItemRawSchema = z.object({
  name: z.string().max(500).optional().default(''),
  description: z.string().max(2000).optional().nullable(),
  /** Allow 0 so bad model output does not fail the whole extract; merge treats ≤0 as “ask quantity”. */
  quantity: z.number().min(0).max(1e6).optional(),
  unit_price: z.number().min(0).max(1e10).optional(),
  price: z.number().min(0).max(1e10).optional(),
  rate: z.number().min(0).max(1e10).optional(),
  unit_label: z.string().max(40).optional(),
});

export const wizardAiExtractSchema = z.object({
  customer_name: z.string().trim().max(500).optional().default(''),
  customer_email: z
    .string()
    .optional()
    .transform((v) => extractEmailAddress(v ?? ''))
    .pipe(z.union([z.string().email(), z.literal('')])),
  customer_phone: z.string().trim().max(80).optional().default(''),
  /** Contact person only — not the company name */
  customer_contact_name: z.string().trim().max(200).optional().default(''),
  customer_address: z.string().trim().max(500).optional().default(''),
  customer_address_line1: z.string().trim().max(200).optional().default(''),
  customer_address_line2: z.string().trim().max(200).optional().default(''),
  customer_city: z.string().trim().max(120).optional().default(''),
  customer_state: z.string().trim().max(120).optional().default(''),
  customer_postal_code: z.string().trim().max(32).optional().default(''),
  customer_country: z.string().trim().max(80).optional().default(''),
  items: z.array(wizardLineItemRawSchema).optional().default([]),
  due_date: z.string().optional(),
  notes: z.string().max(2000).optional(),
  currency: z.string().trim().max(3).optional(),
  tax_percent: z.number().min(0).max(100).optional(),
  discount_percent: z.number().min(0).max(100).optional(),
  discount_amount: z.number().min(0).max(1e10).optional(),
  use_payment_schedule: z.boolean().optional(),
});

export type WizardAiExtract = z.infer<typeof wizardAiExtractSchema>;

/** True when the model returned something that can advance invoice drafting (not an empty OK). */
export function wizardExtractHasInvoicePayload(ex: WizardAiExtract): boolean {
  if (String(ex.customer_name ?? '').trim()) return true;
  if (String(ex.customer_email ?? '').trim()) return true;
  if (String(ex.customer_phone ?? '').trim()) return true;
  if (String(ex.customer_contact_name ?? '').trim()) return true;
  if (String(ex.customer_address ?? '').trim()) return true;
  if (String(ex.customer_address_line1 ?? '').trim()) return true;
  if (String(ex.customer_city ?? '').trim()) return true;
  if (String(ex.customer_country ?? '').trim()) return true;
  if ((ex.items?.length ?? 0) > 0) return true;
  if (String(ex.due_date ?? '').trim()) return true;
  return false;
}
