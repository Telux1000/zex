import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedInvoice } from '@/lib/validations/invoice';
import { resolveDiscountAmount } from '@/lib/validations/invoice';
import { parseDueDate, formatDueDate } from '@/lib/utils/date';
import type { InvoiceMutationSource } from '@/lib/audit-log';
import { resolveActorDisplayName } from '@/lib/audit-log';
import { findExistingCustomer } from '@/lib/customers';
import { logInvoiceDraftCreated } from '@/lib/invoices/log-invoice-draft-created';
import { isInvalidGenericCustomerName } from '@/lib/customers/match-from-text';
import { isSupportedCurrency } from '@/lib/currency/supported';
import { resolveInvoiceTransactionCurrency } from '@/lib/business/currency-policy';
import { buildInvoiceCustomerSnapshot } from '@/lib/invoices/customer-snapshot';
import { invoiceCustomerSnapshotToPublic } from '@/lib/invoices/invoice-public-customer';
import { normalizeInvoiceAssignee } from '@/lib/invoices/invoice-time-summary';
import { syncSavedLineItemsFromUsage } from '@/lib/saved-line-items/sync-saved-line-items';

export interface CreateFromParsedInput {
  businessId: string;
  /** Company base / reporting currency (ISO 4217). Transaction currency is resolved via currency policy. */
  currency: string;
  parsed: ParsedInvoice;
  customerId?: string | null;
  themeId?: string | null;
  /** Auth user performing the create (audit + activity). */
  actorUserId: string;
  /** Optional; resolved from profile when omitted. */
  actorDisplayName?: string | null;
  /** Defaults to `assistant` for AI/wizard/parse flows. */
  source?: InvoiceMutationSource;
}

/**
 * Create invoice + items in DB from validated parsed invoice. Uses next_invoice_number.
 * Logs activity. Does not send or charge.
 */
export async function createInvoiceFromParsed(
  supabase: SupabaseClient,
  input: CreateFromParsedInput
) {
  const parsedCustomerNameRaw = String(input.parsed.customer_name ?? '').trim();
  const parsedCustomerName = isInvalidGenericCustomerName(parsedCustomerNameRaw)
    ? ''
    : parsedCustomerNameRaw;
  const schedule = input.parsed.use_payment_schedule ? (input.parsed.payment_schedule ?? []) : [];
  const scheduleDueDates = schedule.map((r) => String(r.due_date)).filter(Boolean).sort();
  const dueDate = parseDueDate(
    (scheduleDueDates.length ? scheduleDueDates[scheduleDueDates.length - 1] : input.parsed.due_date) ?? 'in 30 days'
  );
  const dueDateStr = formatDueDate(dueDate);
  const issueDate = new Date().toISOString().slice(0, 10);

  const subtotal = input.parsed.items.reduce((s, i) => s + i.amount, 0);
  const discountAmount = resolveDiscountAmount(subtotal, {
    discount_amount: input.parsed.discount_amount,
    discount_percent: input.parsed.discount_percent,
  });
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount =
    input.parsed.tax_amount ??
    (input.parsed.tax_percent != null ? afterDiscount * (input.parsed.tax_percent / 100) : 0);
  const total = input.parsed.total ?? afterDiscount + taxAmount;

  const { data: invNum } = await supabase.rpc('next_invoice_number', {
    p_business_id: input.businessId,
  });
  const invoiceNumber = (invNum as string) ?? 'INV-00001';

  let customerId = input.customerId ?? null;
  let customerPreferredCurrency: string | null = null;
  let resolvedCustomerName = '';
  let resolvedCustomerEmail =
    String(input.parsed.customer_email ?? '').trim() || null;
  let customerSnapshot: ReturnType<typeof buildInvoiceCustomerSnapshot> = null;
  if (customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select(
        'id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, preferred_currency_code'
      )
      .eq('id', customerId)
      .eq('business_id', input.businessId)
      .maybeSingle();
    if (!customer?.id) {
      customerId = null;
    } else {
      resolvedCustomerName = String(
        (customer as { company?: string | null; name?: string | null }).company ||
          (customer as { company?: string | null; name?: string | null }).name ||
          ''
      ).trim();
      resolvedCustomerEmail =
        String((customer as { email?: string | null }).email ?? '').trim() || resolvedCustomerEmail;
      customerSnapshot = buildInvoiceCustomerSnapshot(customer as {
        name?: string | null;
        company?: string | null;
        email?: string | null;
        phone?: string | null;
        address_line1?: string | null;
        address_line2?: string | null;
        city?: string | null;
        state?: string | null;
        postal_code?: string | null;
        country?: string | null;
      });
    }
    const code = String((customer as { preferred_currency_code?: string } | null)?.preferred_currency_code ?? '')
      .trim()
      .toUpperCase();
    if (code && isSupportedCurrency(code)) customerPreferredCurrency = code;
  } else {
    const customerName = parsedCustomerName;
    if (customerName) {
      const q = `%${customerName.replace(/,/g, '')}%`;
      const { data: matchedCustomer } = await supabase
        .from('customers')
        .select(
          'id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, preferred_currency_code'
        )
        .eq('business_id', input.businessId)
        .or(`company.ilike.${q},name.ilike.${q}`)
        .limit(1)
        .maybeSingle();
      if (matchedCustomer?.id) {
        customerId = String(matchedCustomer.id);
        resolvedCustomerName = String(
          (matchedCustomer as { company?: string | null; name?: string | null }).company ||
            (matchedCustomer as { company?: string | null; name?: string | null }).name ||
            ''
        ).trim();
        resolvedCustomerEmail =
          String((matchedCustomer as { email?: string | null }).email ?? '').trim() ||
          resolvedCustomerEmail;
        customerSnapshot = buildInvoiceCustomerSnapshot(matchedCustomer as {
          name?: string | null;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
        });
      }
      const code = String((matchedCustomer as { preferred_currency_code?: string } | null)?.preferred_currency_code ?? '')
        .trim()
        .toUpperCase();
      if (code && isSupportedCurrency(code)) customerPreferredCurrency = code;
    }
  }
  if (!customerId && parsedCustomerName) {
    const existing = await findExistingCustomer(supabase, input.businessId, {
      company: parsedCustomerName,
      name: parsedCustomerName,
      email: input.parsed.customer_email || null,
    });
    if (existing?.id) {
      customerId = existing.id;
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select(
          'id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, preferred_currency_code'
        )
        .eq('id', existing.id)
        .eq('business_id', input.businessId)
        .maybeSingle();
      if (existingCustomer?.id) {
        resolvedCustomerName = String(existingCustomer.company || existingCustomer.name || '').trim();
        resolvedCustomerEmail = String(existingCustomer.email ?? '').trim() || resolvedCustomerEmail;
        customerSnapshot = buildInvoiceCustomerSnapshot(existingCustomer);
        const code = String(existingCustomer.preferred_currency_code ?? '')
          .trim()
          .toUpperCase();
        if (code && isSupportedCurrency(code)) customerPreferredCurrency = code;
      } else {
        resolvedCustomerName = parsedCustomerName;
      }
    }
  }
  const invoiceCurrency = resolveInvoiceTransactionCurrency({
    businessBase: input.currency || 'USD',
    customerPreferred: customerPreferredCurrency,
    invoiceCurrencyOverride: input.parsed.currency ?? null,
  });

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      business_id: input.businessId,
      customer_id: customerId,
      customer_name: customerId ? resolvedCustomerName : '',
      customer_email: customerId ? resolvedCustomerEmail : null,
      status: 'draft',
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDateStr,
      currency: invoiceCurrency,
      subtotal,
      tax_amount: taxAmount,
      total,
      discount_amount: discountAmount,
      notes: input.parsed.notes ?? null,
      theme_id: input.themeId ?? null,
      metadata: customerSnapshot
        ? {
            ...customerSnapshot,
            customerSnapshot: invoiceCustomerSnapshotToPublic(
              customerSnapshot,
              resolvedCustomerName,
              resolvedCustomerEmail
            ),
          }
        : null,
      use_payment_schedule: !!input.parsed.use_payment_schedule,
      amount_paid: 0,
      balance_due: total,
    })
    .select()
    .single();

  if (invError || !invoice) {
    const msg = invError?.message ?? 'Failed to create invoice';
    const hint = /discount_amount|reference_po|terms|metadata|column.*does not exist/i.test(msg)
      ? ' Run migration 006_invoices_pricing_and_metadata.sql in Supabase SQL Editor, then restart the dev server.'
      : '';
    throw new Error(msg + hint);
  }

  for (let i = 0; i < input.parsed.items.length; i++) {
    const item = input.parsed.items[i];
    await supabase.from('invoice_items').insert({
      invoice_id: invoice.id,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.amount,
      unit_label: item.unit_label ?? 'item',
      sort_order: i,
      assignee: normalizeInvoiceAssignee((item as { assignee?: unknown }).assignee),
    });
  }

  if (input.parsed.use_payment_schedule && schedule.length > 0) {
    for (const row of schedule) {
      await supabase.from('invoice_payment_schedule_items').insert({
        invoice_id: invoice.id,
        description: row.description,
        amount: Number(row.amount),
        due_date: row.due_date,
        status: row.status ?? 'pending',
      });
    }
  }

  const actorName =
    String(input.actorDisplayName ?? '').trim() ||
    (await resolveActorDisplayName(supabase, input.actorUserId)) ||
    'User';
  const customerNameForLog = customerId ? resolvedCustomerName : parsedCustomerName;
  const source: InvoiceMutationSource = input.source ?? 'assistant';
  await logInvoiceDraftCreated({
    supabase,
    businessId: input.businessId,
    performedByUserId: input.actorUserId,
    performedByName: actorName,
    invoiceId: String(invoice.id),
    invoiceNumber,
    customerName: customerNameForLog,
    total,
    currencyCode: invoiceCurrency,
    source,
    hasPaymentSchedule: !!input.parsed.use_payment_schedule && schedule.length > 0,
  });

  void syncSavedLineItemsFromUsage(supabase, {
    businessId: input.businessId,
    currency: invoiceCurrency,
    items: input.parsed.items.map((it) => ({
      name: it.name,
      description: it.description ?? null,
      unit_label: (it as { unit_label?: string | null }).unit_label,
      unit_price: it.unit_price,
      tax_percent: (it as { tax_percent?: number | null }).tax_percent ?? 0,
    })),
  }).catch((e) => console.error('[saved-line-items]', e));

  return invoice;
}
