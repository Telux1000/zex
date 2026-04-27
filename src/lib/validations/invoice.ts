import { z } from 'zod';
import { extractEmailAddress } from '@/lib/utils/email';
import { isSupportedCurrency } from '@/lib/currency/supported';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { invoiceTemplateIdSchema } from '@/lib/invoices/invoice-template-ids';

/**
 * Resolve effective discount amount from either a fixed amount or a percentage.
 * Rule: if discount_amount is provided and > 0, use it (capped at subtotal); else if discount_percent is provided, compute from subtotal; else 0.
 * Used for validation, API, and create-from-parsed. Only discount_amount is stored in the DB.
 */
export function resolveDiscountAmount(
  subtotal: number,
  opts: { discount_amount?: number | null; discount_percent?: number | null }
): number {
  const { discount_amount, discount_percent } = opts;
  if (discount_amount != null && discount_amount > 0) {
    return Math.min(discount_amount, subtotal);
  }
  if (discount_percent != null && discount_percent > 0) {
    return Math.min((subtotal * discount_percent) / 100, subtotal);
  }
  return 0;
}

/**
 * Validation layer: AI outputs and API payloads are validated here.
 * AI never writes directly to DB; we validate then persist.
 */

const rawItemSchema = z.object({
  name: z.string().min(1, 'Item name required').max(500),
  description: z.string().max(2000).optional(),
  quantity: z.number().positive().max(1e6),
  unit_price: z.number().min(0).max(1e10).optional(),
  /** Alias for unit_price (AI / voice / integrations) */
  price: z.number().min(0).max(1e10).optional(),
  rate: z.number().min(0).max(1e10).optional(),
  /** Billing unit: item, hour, day, week, month, session, project, or custom (short slug). */
  unit_label: z.string().max(40).optional(),
  /** Optional consultant / staff name for Time Summary grouping. */
  assignee: z.string().max(200).optional().nullable(),
  /** Optional hint from AI; totals are always derived as quantity × rate. */
  line_total: z.number().min(0).max(1e12).optional(),
});
export const invoiceItemSchema = rawItemSchema.transform((data) => {
  const unitPrice = data.unit_price ?? data.price ?? data.rate ?? 0;
  const unit_label = normalizeInvoiceUnitLabel(data.unit_label);
  const amount = data.quantity * unitPrice;
  const assigneeRaw = data.assignee != null ? String(data.assignee).trim() : '';
  const assignee = assigneeRaw ? assigneeRaw.slice(0, 200) : null;
  return {
    name: data.name,
    description: data.description ?? null,
    quantity: data.quantity,
    unit_label,
    unit_price: unitPrice,
    amount,
    assignee,
  };
});

export const parsedInvoiceSchema = z
  .object({
    customer_name: z.string().trim().max(500).optional().default(''),
    customer_email: z
      .string()
      .optional()
      .transform((v) => extractEmailAddress(v ?? ''))
      .pipe(z.union([z.string().email(), z.literal('')])),
    items: z.array(invoiceItemSchema).min(1, 'At least one line item required'),
    total: z.coerce.number().min(0).optional(),
    due_date: z.string().optional(),
    notes: z.string().max(2000).optional(),
    discount_amount: z.coerce.number().min(0).max(1e10).optional(),
    discount_percent: z.coerce.number().min(0).max(100).optional(),
    tax_amount: z.coerce.number().min(0).max(1e10).optional(),
    tax_percent: z.coerce.number().min(0).max(100).optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .length(3)
      .refine((v) => isSupportedCurrency(v), 'Unsupported currency code')
      .optional(),
    use_payment_schedule: z.boolean().optional(),
    payment_schedule: z
      .array(
        z.object({
          description: z.string().min(1).max(200),
          amount: z.coerce.number().min(0.01).max(1e10),
          due_date: z.string().min(1),
          status: z.enum(['pending', 'paid']).optional(),
        })
      )
      .optional(),
  })
  .refine(
    (data) => {
      const subtotal = data.items.reduce((sum, i) => sum + i.amount, 0);
      const lineTaxTotal = data.items.reduce((sum, i) => {
        const qty = Number(i.quantity ?? 0);
        const unit = Number(i.unit_price ?? 0);
        const lineTaxPct = Number((i as { tax_percent?: number }).tax_percent ?? 0);
        return sum + qty * unit * (lineTaxPct / 100);
      }, 0);
      const discount = resolveDiscountAmount(subtotal, {
        discount_amount: data.discount_amount,
        discount_percent: data.discount_percent,
      });
      const afterDiscount = Math.max(0, subtotal - discount);
      const tax =
        data.tax_amount ?? (data.tax_percent != null ? afterDiscount * (data.tax_percent / 100) : 0);
      const expectedTotal = afterDiscount + tax + lineTaxTotal;
      if (data.total != null && Math.abs(expectedTotal - data.total) > 0.02) return false;
      const finalTotal = data.total ?? expectedTotal;
      if (data.use_payment_schedule && (data.payment_schedule?.length ?? 0) > 0) {
        const sum = (data.payment_schedule ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
        if (Math.abs(sum - finalTotal) > 0.02) return false;
      }
      return true;
    },
    { message: 'Total does not match subtotal minus discount plus tax' }
  );

export type ParsedInvoice = z.infer<typeof parsedInvoiceSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

const paymentScheduleRowSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().min(1).max(200),
  amount: z.number().min(0.01).max(1e10),
  due_date: z.string().min(1),
  status: z.enum(['pending', 'paid']).optional(),
});

const clientBillingSchema = z.object({
  contact_person: z.string().max(500).optional().nullable(),
  company: z.string().max(500).optional().nullable(),
  billing_address_line1: z.string().max(500).optional().nullable(),
  billing_address_line2: z.string().max(500).optional().nullable(),
  billing_address: z.string().max(1000).optional().nullable(),
  billing_city: z.string().max(200).optional().nullable(),
  billing_state: z.string().max(200).optional().nullable(),
  billing_postal_code: z.string().max(50).optional().nullable(),
  billing_country: z.string().max(10).optional().nullable(),
  billing_phone: z.string().max(50).optional().nullable(),
  use_delivery_address: z.boolean().optional(),
  delivery_company: z.string().max(500).optional().nullable(),
  delivery_contact_person: z.string().max(500).optional().nullable(),
  delivery_email: z.string().email().optional().nullable(),
  delivery_phone: z.string().max(50).optional().nullable(),
  delivery_address: z.string().max(1000).optional().nullable(),
  delivery_city: z.string().max(200).optional().nullable(),
  delivery_state: z.string().max(200).optional().nullable(),
  delivery_postal_code: z.string().max(50).optional().nullable(),
  delivery_country: z.string().max(10).optional().nullable(),
}).optional().nullable();

export const createInvoiceBodySchema = z.object({
  customer_name: z.string().trim().max(500).optional().default(''),
  customer_email: z.string().email().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  due_date: z.string(),
  issue_date: z.string().optional(),
  currency: z.string().length(3).optional(),
  tax_amount: z.number().min(0).max(1e10).optional(),
  tax_percent: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).optional().nullable(),
  reference_po: z.string().max(200).optional().nullable(),
  discount_amount: z.number().min(0).max(1e10).optional(),
  discount_percent: z.number().min(0).max(100).optional(),
  terms: z.string().max(2000).optional().nullable(),
  client_billing: clientBillingSchema,
  use_payment_schedule: z.boolean().optional(),
  payment_schedule: z.array(paymentScheduleRowSchema).optional(),
  /** When true, invoice document shows a derived Time Summary from hour-based lines + assignee. */
  show_time_summary: z.boolean().optional(),
  items: z.array(z.object({
    name: z.string().min(1).max(500),
    description: z.string().max(2000).optional().nullable(),
    quantity: z.number().positive().max(1e6),
    unit_price: z.number().min(0).max(1e10),
    unit_label: z.string().max(40).optional(),
    tax_percent: z.number().min(0).max(100).optional(),
    assignee: z.string().max(200).optional().nullable(),
  })),
  theme_id: z.string().uuid().optional().nullable(),
  template_id: invoiceTemplateIdSchema.optional(),
  /** Optional manual override; otherwise server fetches rate when invoice currency ≠ base */
  exchange_rate_to_base: z.number().positive().max(1e12).optional(),
  use_customer_reminder_defaults: z.boolean().optional(),
  reminder_settings: z.any().optional(),
});

export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;
export type ClientBilling = z.infer<typeof clientBillingSchema>;
