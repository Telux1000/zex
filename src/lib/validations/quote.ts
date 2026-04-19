import { z } from 'zod';
import { isSupportedCurrency } from '@/lib/currency/supported';

export const quoteStatusSchema = z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'accepted_customer', 'rejected_customer']);

export const quoteItemSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  quantity: z.number().positive().max(1e6),
  unit_price: z.number().min(0).max(1e10),
  tax_percent: z.number().min(0).max(100).optional().default(0),
});

const optionalEmail = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.union([z.string().email(), z.null()]).optional()
);

export const customerSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(500),
  email: optionalEmail,
  address: z.string().max(2000).optional().nullable(),
  company: z.string().max(500).optional().nullable(),
  address_line1: z.string().max(1000).optional().nullable(),
  address_line2: z.string().max(1000).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  state: z.string().max(200).optional().nullable(),
  postal_code: z.string().max(50).optional().nullable(),
  country: z.string().max(200).optional().nullable(),
  use_delivery_address: z.boolean().optional().nullable(),
  delivery_address_line1: z.string().max(1000).optional().nullable(),
  delivery_address_line2: z.string().max(1000).optional().nullable(),
  delivery_city: z.string().max(200).optional().nullable(),
  delivery_state: z.string().max(200).optional().nullable(),
  delivery_postal_code: z.string().max(50).optional().nullable(),
  delivery_country: z.string().max(200).optional().nullable(),
});

export const createQuoteBodySchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  customer_snapshot: customerSnapshotSchema,
  issue_date: z.string(),
  expiry_date: z.string().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3)
    .refine((v) => isSupportedCurrency(v), 'Unsupported currency code'),
  items: z.array(quoteItemSchema).min(1),
});

const emptyToNull = (v: unknown) => {
  if (v === undefined) return undefined;
  if (v === '' || v === null) return null;
  return v;
};

export const updateQuoteBodySchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  customer_snapshot: customerSnapshotSchema.optional(),
  issue_date: z.string().optional(),
  expiry_date: z.string().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3)
    .refine((v) => isSupportedCurrency(v), 'Unsupported currency code')
    .optional(),
  items: z.array(quoteItemSchema).min(1).optional(),
  status: quoteStatusSchema.optional(),
  accepted_via: z.preprocess(emptyToNull, z.string().max(2000).nullable().optional()),
  accepted_note: z.preprocess(
    emptyToNull,
    z.string().max(2000).nullable().optional()
  ),
  rejected_via: z.preprocess(emptyToNull, z.string().max(2000).nullable().optional()),
  rejection_reason: z.preprocess(
    emptyToNull,
    z.string().max(2000).nullable().optional()
  ),
  confirmation_channel: z.enum(['email', 'phone', 'in_person']).nullable().optional(),
});

export type CreateQuoteBody = z.infer<typeof createQuoteBodySchema>;
export type UpdateQuoteBody = z.infer<typeof updateQuoteBodySchema>;
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

