import { notFound } from 'next/navigation';
import { hasPermission } from '@/lib/rbac/permissions';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { InvoiceDetailClient } from '@/components/invoices/InvoiceDetailClient';
import { normalizeInvoiceCurrencyFields } from '@/lib/invoices/currency-edit';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { computeInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import {
  applyRefundDisplayStatus,
  canShowRefundMenuAction,
  resolveRefundDisplayStatus,
} from '@/lib/invoices/refund-display';
import {
  formatScheduledSendPreviewLine,
  normalizeBusinessTimezone,
} from '@/lib/invoices/scheduled-send-time';
import { processScheduledInvoiceSends } from '@/lib/invoices/scheduled-invoice-send-cron';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { invoiceSaveTimingEnabled } from '@/lib/dev/invoice-save-timing';
import { normalizeInvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';
import {
  buildInvoiceDashboardCoreSelect,
  buildInvoiceDashboardFallbackSelect,
  INVOICE_BUSINESS_STANDALONE_SELECT,
} from '@/lib/invoices/invoice-detail-core-select';
import { formatDisplayDate } from '@/lib/utils/date';


export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }> | { saved?: string };
}) {
  const tRsc0 = invoiceSaveTimingEnabled() ? performance.now() : 0;
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;
  const { id } = await params;
  const sp =
    searchParams == null
      ? ({} as { saved?: string })
      : searchParams instanceof Promise
        ? await searchParams
        : searchParams;
  const isPostSaveNavigation = sp.saved === '1';

  const tInv0 = invoiceSaveTimingEnabled() ? performance.now() : 0;
  type BusinessRow = {
    id: string;
    name: string;
    currency: string;
    logo_url?: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    tax_id?: string | null;
    payment_settings?: Record<string, unknown> | null;
    stripe_charges_enabled?: boolean;
    timezone?: string | null;
  };
  let { data: rowInitial, error: invErr } = await supabase
    .from('invoices')
    .select(buildInvoiceDashboardCoreSelect())
    .eq('id', id)
    .single();
  if (invErr || !rowInitial) {
    if (invoiceSaveTimingEnabled() && invErr) {
      console.error(
        '[invoice-detail] lean invoice select failed; falling back to * + embeds',
        (invErr as { message?: string })?.message ?? invErr
      );
    }
    const fb = await supabase
      .from('invoices')
      .select(buildInvoiceDashboardFallbackSelect())
      .eq('id', id)
      .single();
    rowInitial = fb.data as typeof rowInitial;
    invErr = fb.error;
  }
  if (invErr || !rowInitial) {
    if (invoiceSaveTimingEnabled() && invErr) {
      console.error(
        '[invoice-detail] invoice not loadable after fallback',
        (invErr as { message?: string })?.message ?? invErr
      );
    }
    notFound();
  }
  if (tInv0) {
    const ms = performance.now() - tInv0;
    if (invoiceSaveTimingEnabled()) {
      console.log(`[invoice-save] server invoice [id] RSC +${ms.toFixed(1)}ms step:invoice_core_query`);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic select
  let row: any = rowInitial;

  let business = row.businesses as BusinessRow | null;
  if (!business && row.business_id) {
    const { data: bRow } = await supabase
      .from('businesses')
      .select(INVOICE_BUSINESS_STANDALONE_SELECT)
      .eq('id', String(row.business_id))
      .maybeSingle();
    if (bRow) {
      business = bRow as unknown as BusinessRow;
    }
  }
  if (!business) notFound();

  const accountTimezone = normalizeBusinessTimezone(business.timezone);

  const tRole0 = invoiceSaveTimingEnabled() ? performance.now() : 0;
  const role = await getEffectiveBusinessRole(supabase, business.id, user.id);
  if (!role || !hasPermission(role, 'view_data')) notFound();
  if (tRole0) {
    const ms = performance.now() - tRole0;
    if (invoiceSaveTimingEnabled()) {
      console.log(`[invoice-save] server invoice [id] RSC +${ms.toFixed(1)}ms step:rbac_view_data`);
    }
  }

  /** After save, skip slow admin/cron drain + meta re-fetch; detail secondary API can refine. */
  const admin = getSupabaseServiceAdmin();
  if (admin && !isPostSaveNavigation) {
    const tAdmin0 = invoiceSaveTimingEnabled() ? performance.now() : 0;
    const rawSt = String((row as { status?: string }).status ?? '').toLowerCase();
    const schedAt = (row as { scheduled_send_at?: string | null }).scheduled_send_at;
    if (rawSt === 'draft' && schedAt && String(schedAt).trim() !== '') {
      const dueMs = Date.parse(String(schedAt));
      if (!Number.isNaN(dueMs) && dueMs <= Date.now()) {
        try {
          await processScheduledInvoiceSends(admin, new Date(), { businessId: business.id });
        } catch (e) {
          console.error('[scheduled-invoice-send] invoice detail page drain failed', e);
        }
        const { data: fresh } = await supabase
          .from('invoices')
          .select(buildInvoiceDashboardCoreSelect())
          .eq('id', id)
          .single();
        if (fresh) {
          const f = fresh as unknown as Record<string, unknown>;
          row = {
            ...(row as Record<string, unknown>),
            ...f,
            businesses: (row as { businesses?: unknown }).businesses,
            invoice_items: (row as { invoice_items?: unknown }).invoice_items,
            customers: (row as { customers?: unknown }).customers,
          } as any;
        }
      }
    }
    const { data: metaFresh } = await supabase
      .from('invoices')
      .select(
        'status, reminder_settings, use_customer_reminder_defaults, scheduled_send_at, scheduled_send_timezone'
      )
      .eq('id', id)
      .single();
    if (metaFresh) {
      row = {
        ...(row as Record<string, unknown>),
        ...(metaFresh as unknown as Record<string, unknown>),
        businesses: (row as { businesses?: unknown }).businesses,
        invoice_items: (row as { invoice_items?: unknown }).invoice_items,
        customers: (row as { customers?: unknown }).customers,
      } as any;
    }
    if (tAdmin0) {
      const ms = performance.now() - tAdmin0;
      if (invoiceSaveTimingEnabled()) {
        console.log(`[invoice-save] server invoice [id] RSC +${ms.toFixed(1)}ms step:admin_cron_drain_and_meta`);
      }
    }
  } else if (isPostSaveNavigation && invoiceSaveTimingEnabled()) {
    console.log(
      `[invoice-save] server invoice [id] RSC step:admin_cron_drain_and_meta SKIPPED (saved=1 first paint)`
    );
  }

  const items = (row.invoice_items ?? []) as {
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    unit_label?: string | null;
    amount: number;
    tax_percent?: number;
  }[];

  const savedBusiness = {
    name: business.name,
    currency: business.currency,
    logo_url: business.logo_url ?? null,
    address_line1: business.address_line1 ?? null,
    address_line2: business.address_line2 ?? null,
    city: business.city ?? null,
    state: business.state ?? null,
    postal_code: business.postal_code ?? null,
    country: business.country ?? null,
    tax_id: business.tax_id ?? null,
    payment_settings: (business.payment_settings as unknown) ?? null,
    stripe_charges_enabled: business.stripe_charges_enabled ?? false,
  };

  const normalizedCurrency = normalizeInvoiceCurrencyFields(
    {
      currency: (row as { currency?: string }).currency ?? business.currency,
      base_currency_code: (row as { base_currency_code?: string }).base_currency_code ?? business.currency,
      exchange_rate_to_base: (row as { exchange_rate_to_base?: number }).exchange_rate_to_base ?? null,
      subtotal: Number(row.subtotal),
      tax_amount: Number(row.tax_amount),
      total: Number(row.total),
      subtotal_in_base: (row as { subtotal_in_base?: number }).subtotal_in_base ?? null,
      tax_amount_in_base: (row as { tax_amount_in_base?: number }).tax_amount_in_base ?? null,
      total_in_base: (row as { total_in_base?: number }).total_in_base ?? null,
    },
    business.currency
  );

  const savedInvoice = {
    invoice_number: row.invoice_number,
    reference_po: row.reference_po ?? null,
    issue_date: row.issue_date ?? '',
    due_date: row.due_date ?? '',
    paid_at: (row as { paid_at?: string | null }).paid_at ?? null,
    status: row.status,
    customer_name: row.customer_name,
    customer_email: row.customer_email ?? null,
    sourceQuoteId: (row as { source_quote_id?: string | null }).source_quote_id ?? null,
    sourceQuoteNumber: (row as { source_quote_number?: string | null }).source_quote_number ?? null,
    convertedFromQuote: (row as { converted_from_quote?: boolean | null }).converted_from_quote ?? false,
    convertedAt: (row as { converted_at?: string | null }).converted_at ?? null,
    currency: normalizedCurrency.currency,
    base_currency_code: normalizedCurrency.base_currency_code,
    exchange_rate_to_base: normalizedCurrency.exchange_rate_to_base,
    subtotal_in_base: normalizedCurrency.subtotal_in_base,
    tax_amount_in_base: normalizedCurrency.tax_amount_in_base,
    total_in_base: normalizedCurrency.total_in_base,
    subtotal: Number(row.subtotal),
    tax_amount: Number(row.tax_amount),
    total: Number(row.total),
    amount_paid: row.amount_paid != null ? Number(row.amount_paid) : 0,
    total_refunded:
      (row as { total_refunded?: number | null }).total_refunded != null
        ? Number((row as { total_refunded?: number | null }).total_refunded)
        : 0,
    balance_due:
      row.balance_due != null
        ? Number(row.balance_due)
        : Math.max(
            0,
            Number(row.total) -
              Number(row.amount_paid ?? 0) +
              Number((row as { total_refunded?: number | null }).total_refunded ?? 0)
          ),
    discount_amount: row.discount_amount != null ? Number(row.discount_amount) : 0,
    discount_percent:
      (row as { discount_percent?: number | null }).discount_percent != null
        ? Number((row as { discount_percent?: number | null }).discount_percent)
        : null,
    tax_percent:
      (row as { tax_percent?: number | null }).tax_percent != null
        ? Number((row as { tax_percent?: number | null }).tax_percent)
        : null,
    notes: row.notes ?? null,
    terms: row.terms ?? null,
    metadata: (row.metadata as {
      contact_person?: string;
      company?: string;
      billing_address?: string;
      billing_city?: string;
      billing_state?: string;
      billing_postal_code?: string;
      billing_country?: string;
      billing_phone?: string;
      use_delivery_address?: boolean | null;
      delivery_company?: string | null;
      delivery_contact_person?: string | null;
      delivery_email?: string | null;
      delivery_phone?: string | null;
      delivery_address?: string | null;
      delivery_city?: string | null;
      delivery_state?: string | null;
      delivery_postal_code?: string | null;
      delivery_country?: string | null;
    } | null) ?? null,
    scheduled_send_at: (row as { scheduled_send_at?: string | null }).scheduled_send_at ?? null,
    scheduled_send_timezone: (row as { scheduled_send_timezone?: string | null }).scheduled_send_timezone ?? null,
    show_time_summary: !!(row as { show_time_summary?: boolean }).show_time_summary,
    template_id: normalizeInvoiceTemplateId((row as { template_id?: string | null }).template_id),
  };

  const savedItems = items.map((i) => ({
    name: i.name,
    description: i.description ?? null,
    quantity: i.quantity,
    unit_price: Number(i.unit_price),
    unit_label: i.unit_label ?? 'item',
    amount: Number(i.amount),
    tax_percent: i.tax_percent != null ? Number(i.tax_percent) : 0,
  }));

  const tSched0 = invoiceSaveTimingEnabled() ? performance.now() : 0;
  const { data: scheduleRows } = await supabase
    .from('invoice_payment_schedule_items')
    .select('id, description, amount, due_date, status, paid_at')
    .eq('invoice_id', row.id)
    .order('due_date', { ascending: true });
  if (tSched0) {
    const ms = performance.now() - tSched0;
    if (invoiceSaveTimingEnabled()) {
      console.log(`[invoice-save] server invoice [id] RSC +${ms.toFixed(1)}ms step:payment_schedule_query`);
    }
  }

  /** Refined in GET /api/.../secondary-panels; first paint uses invoice.total_refunded only. */
  const refundedTotal = Number((row as { total_refunded?: number | null }).total_refunded ?? 0);

  const canManageRecurring =
    hasPermission(role, 'create_invoice') || hasPermission(role, 'manage_invoices');

  const customerReminderSettings =
    (row as { customers?: { reminder_settings?: unknown } | null }).customers?.reminder_settings ?? null;

  const amountPaidNum = row.amount_paid != null ? Number(row.amount_paid) : 0;
  const totalRefundedNum =
    (row as { total_refunded?: number | null }).total_refunded != null
      ? Number((row as { total_refunded?: number | null }).total_refunded)
      : 0;
  const rawStForBal = String(row.status ?? '').toLowerCase();
  const balanceDueNum =
    rawStForBal === 'voided' || rawStForBal === 'cancelled'
      ? 0
      : computeInvoiceBalanceDue(Number(row.total ?? 0), amountPaidNum, totalRefundedNum);
  const derivedStatus = deriveInvoiceStatus({
    status: String(row.status ?? ''),
    total: Number(row.total),
    amount_paid: amountPaidNum,
    balance_due: balanceDueNum,
    total_refunded: totalRefundedNum,
  });
  const refundDisplayStatus = resolveRefundDisplayStatus({
    grossPaidAmount: amountPaidNum,
    refundedAmount: refundedTotal,
  });
  const displayStatus = applyRefundDisplayStatus(derivedStatus, refundDisplayStatus);
  const rawInvoiceStatus = String(row.status ?? '').toLowerCase();
  const showRefundAction = canShowRefundMenuAction({
    status: rawInvoiceStatus,
    grossPaidSucceeded: amountPaidNum,
    refundedSucceededAndPending: refundedTotal,
  });
  const scheduledAtRaw = (row as { scheduled_send_at?: string | null }).scheduled_send_at;
  const scheduledSendLine =
    String(row.status ?? '').toLowerCase() === 'draft' && scheduledAtRaw
      ? formatScheduledSendPreviewLine(String(scheduledAtRaw), accountTimezone)
      : null;

  if (invoiceSaveTimingEnabled()) {
    const totalMs = performance.now() - tRsc0;
    console.log(
      `[invoice-save] server invoice [id] RSC (core first-paint ready) +${totalMs.toFixed(1)}ms id:…${id.slice(
        -4
      )} savedNav=${isPostSaveNavigation ? '1' : '0'}`
    );
  }

  const updatedAtVal = (row as { updated_at?: string | null }).updated_at;
  const savedAtDateLabel = updatedAtVal ? formatDisplayDate(String(updatedAtVal)) : null;

  return (
    <InvoiceDetailClient
      invoiceId={row.id}
      businessId={business.id}
      initialCustomerId={String((row as { customer_id?: string | null }).customer_id ?? '').trim() || null}
      status={displayStatus}
      showRefundAction={showRefundAction}
      invoiceNumber={row.invoice_number}
      dueDate={row.due_date}
      amountPaid={Number(row.amount_paid ?? 0)}
      nextReminderStatusLine={null}
      scheduledSendLine={scheduledSendLine}
      accountTimezone={accountTimezone}
      savedAtDateLabel={savedAtDateLabel}
      autoRemindersInitial={{
        useCustomerReminderDefaults:
          (row as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false,
        reminderSettings: (row as { reminder_settings?: unknown }).reminder_settings ?? null,
        customerReminderSettings,
      }}
      savedBusiness={savedBusiness}
      initialInvoice={savedInvoice}
      items={savedItems}
      scheduleRows={(scheduleRows ?? []).map((r) => ({
        id: String(r.id),
        description: String(r.description),
        amount: Number(r.amount ?? 0),
        due_date: String(r.due_date),
        status: (String(r.status) === 'paid' ? 'paid' : 'pending') as 'pending' | 'paid',
        paid_at: r.paid_at ?? null,
      }))}
      recurringSummary={null}
      canManageRecurring={canManageRecurring}
    />
  );
}
