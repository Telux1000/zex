import type { SupabaseClient } from '@supabase/supabase-js';
import { createActivity } from '@/lib/activity';
import { buildInvoiceFxRow, resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';
import {
  buildInvoiceCustomerSnapshot,
  mergeInvoiceCustomerSnapshots,
  type CustomerSnapshotSource,
} from '@/lib/invoices/customer-snapshot';
import { notifyBusinessEvent } from '@/services/notifications';
import { generatePublicInvoiceToken } from '@/lib/invoices/public-token';
import { invoiceCustomerSnapshotToPublic } from '@/lib/invoices/invoice-public-customer';

export async function convertQuoteToInvoice(
  supabase: SupabaseClient,
  quoteId: string
) {
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', quoteId)
    .single();
  if (!quote) return { ok: false as const, status: 404, error: 'Quote not found' };

  const businessId = String((quote as { business_id: string }).business_id);
  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('id', businessId)
    .single();
  if (!business) return { ok: false as const, status: 404, error: 'Business not found' };

  const qStatus = String((quote as { status?: string }).status ?? '');
  if (qStatus !== 'accepted' && qStatus !== 'accepted_customer') {
    return { ok: false as const, status: 400, error: 'Only accepted quotes can be converted.' };
  }

  const existingInvoiceId = (quote as { converted_invoice_id?: string | null }).converted_invoice_id;
  if (existingInvoiceId) {
    const { data: qTok } = await supabase
      .from('quotes')
      .select('invoice_public_token')
      .eq('id', quoteId)
      .maybeSingle();
    let ipt = String((qTok as { invoice_public_token?: string | null } | null)?.invoice_public_token ?? '').trim() || null;
    if (!ipt) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('public_token')
        .eq('id', existingInvoiceId)
        .maybeSingle();
      ipt = String((inv as { public_token?: string | null } | null)?.public_token ?? '').trim() || null;
    }
    return {
      ok: true as const,
      alreadyConverted: true as const,
      invoice_id: existingInvoiceId,
      invoice_number: String((quote as { converted_invoice_number?: string | null }).converted_invoice_number ?? ''),
      invoice_public_token: ipt,
    };
  }

  const baseCurrency = String((business as { currency?: string }).currency ?? 'USD').toUpperCase();
  const quoteCurrency = String((quote as { currency?: string }).currency ?? baseCurrency).toUpperCase();
  let fxRate = 1;
  try {
    fxRate = await resolveExchangeRateToBase(quoteCurrency, baseCurrency, null);
  } catch {
    fxRate = quoteCurrency === baseCurrency ? 1 : 1;
  }

  const { data: invNum } = await supabase.rpc('next_invoice_number', { p_business_id: businessId });
  const invoiceNumber = String(invNum ?? 'INV-00001');
  const convertedAt = new Date().toISOString();

  const subtotal = Number((quote as { subtotal?: number }).subtotal ?? 0);
  const taxAmount = Number((quote as { tax_amount?: number }).tax_amount ?? 0);
  const total = Number((quote as { total?: number }).total ?? 0);
  const fxRow = buildInvoiceFxRow(baseCurrency, fxRate, subtotal, taxAmount, total);
  const quoteCustomerSnapshot =
    ((quote as { customer_snapshot?: CustomerSnapshotSource | null }).customer_snapshot ?? null) as
      | CustomerSnapshotSource
      | null;
  const quoteMetaSnapshot = buildInvoiceCustomerSnapshot(quoteCustomerSnapshot);
  const quoteCustomerId = String((quote as { customer_id?: string | null }).customer_id ?? '').trim() || null;

  let linkedCustomerSnapshot: CustomerSnapshotSource | null = null;
  if (quoteCustomerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select(
        'name, company, email, phone, address_line1, address_line2, city, state, postal_code, country'
      )
      .eq('id', quoteCustomerId)
      .eq('business_id', businessId)
      .maybeSingle();
    linkedCustomerSnapshot = (customer as CustomerSnapshotSource | null) ?? null;
  }
  const linkedMetaSnapshot = buildInvoiceCustomerSnapshot(linkedCustomerSnapshot);
  const fullCustomerSnapshot = mergeInvoiceCustomerSnapshots(linkedMetaSnapshot, quoteMetaSnapshot);
  const resolvedCustomerName = String(
    linkedCustomerSnapshot?.company ??
      linkedCustomerSnapshot?.name ??
      quoteCustomerSnapshot?.company ??
      quoteCustomerSnapshot?.name ??
      ''
  ).trim();
  const resolvedCustomerEmail =
    String(linkedCustomerSnapshot?.email ?? quoteCustomerSnapshot?.email ?? '').trim() || null;

  const publicToken = generatePublicInvoiceToken();
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      business_id: businessId,
      customer_id: quoteCustomerId,
      public_token: publicToken,
      customer_name: resolvedCustomerName,
      customer_email: resolvedCustomerEmail,
      status: 'draft',
      invoice_number: invoiceNumber,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date().toISOString().slice(0, 10),
      currency: quoteCurrency,
      ...fxRow,
      subtotal,
      tax_amount: taxAmount,
      total,
      notes: (quote as { notes?: string | null }).notes ?? null,
      metadata: {
        ...(fullCustomerSnapshot ?? {}),
        customerSnapshot: invoiceCustomerSnapshotToPublic(
          fullCustomerSnapshot,
          resolvedCustomerName,
          resolvedCustomerEmail
        ),
        quote_id: quoteId,
        quote_number: (quote as { quote_number?: string }).quote_number ?? '',
      },
      amount_paid: 0,
      balance_due: total,
      source_quote_id: quoteId,
      source_quote_number: (quote as { quote_number?: string }).quote_number ?? '',
      converted_from_quote: true,
      converted_at: convertedAt,
    })
    .select('id, invoice_number')
    .single();
  if (invoiceError || !invoice) {
    return { ok: false as const, status: 500, error: invoiceError?.message ?? 'Invoice creation failed' };
  }

  const items = ((quote as { quote_items?: Array<Record<string, unknown>> }).quote_items ?? []) as Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    tax_percent?: number | null;
  }>;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const amount = Number(item.quantity) * Number(item.unit_price);
    await supabase.from('invoice_items').insert({
      invoice_id: invoice.id,
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount,
      unit_label: 'item',
      tax_percent: Number(item.tax_percent ?? 0),
      sort_order: i,
    });
  }

  await supabase
    .from('quotes')
    .update({
      converted_invoice_id: invoice.id,
      converted_invoice_number: invoice.invoice_number,
      converted_at: convertedAt,
      invoice_public_token: publicToken,
    })
    .eq('id', quoteId);

  await createActivity(supabase, {
    business_id: businessId,
    eventType: 'invoice_created',
    title: `Invoice created from quote ${String((quote as { quote_number?: string }).quote_number ?? '')}`,
    description: `Invoice ${invoice.invoice_number} created from accepted quote`,
    entityType: 'invoice',
    entityId: String(invoice.id),
    amount: total,
    currencyCode: quoteCurrency,
    metadata: {
      quote_id: quoteId,
      quote_number: (quote as { quote_number?: string }).quote_number ?? '',
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      source: 'quote_conversion',
    },
  });

  await createActivity(supabase, {
    business_id: businessId,
    eventType: 'quote_converted',
    title: `Quote converted to invoice ${invoice.invoice_number}`,
    description: `Quote converted to invoice ${invoice.invoice_number}`,
    entityType: 'quote',
    entityId: quoteId,
    amount: total,
    currencyCode: quoteCurrency,
    metadata: {
      quote_id: quoteId,
      quote_number: (quote as { quote_number?: string }).quote_number ?? '',
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
    },
  });

  await notifyBusinessEvent(supabase, {
    businessId,
    eventType: 'quote_converted',
    title: `Quote ${String((quote as { quote_number?: string }).quote_number ?? '')} converted`,
    message: `Quote converted to invoice ${invoice.invoice_number}.`,
    entityType: 'quote',
    entityId: quoteId,
    severity: 'success',
    actionLabel: 'View invoice',
    actionTarget: `/dashboard/invoices/${invoice.id}`,
    groupKey: `quote_converted:${quoteId}:${invoice.id}`,
    internalEmail: {
      subject: `Quote converted to invoice ${invoice.invoice_number}`,
      textBody: `Quote ${String((quote as { quote_number?: string }).quote_number ?? '')} was converted to invoice ${invoice.invoice_number}.`,
      tag: 'quote_converted',
    },
  });

  return {
    ok: true as const,
    alreadyConverted: false as const,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    invoice_public_token: publicToken,
  };
}
