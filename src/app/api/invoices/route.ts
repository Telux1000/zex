import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createInvoiceBodySchema, resolveDiscountAmount } from '@/lib/validations/invoice';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { normalizeInvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';
import { normalizeInvoiceAssignee } from '@/lib/invoices/invoice-time-summary';
import { buildInvoiceFxRow, resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';
import { logInvoiceDraftCreated } from '@/lib/invoices/log-invoice-draft-created';
import { findExistingCustomer } from '@/lib/customers';
import { normalizeClientPaymentScheduleCamel } from '@/lib/invoices/normalize-client-payment-schedule';
import { parseInvoiceReminderSettings, serializeInvoiceReminderSettings } from '@/lib/invoices/reminder-settings';
import { assertBusinessPermission } from '@/lib/rbac/server';
import type { InvoiceReadinessBusinessRow } from '@/lib/onboarding/invoice-readiness-server';
import { assertInvoiceCreationReadiness } from '@/lib/onboarding/invoice-readiness-server';
import {
  buildInvoiceRecurringSummary,
  type RecurringRuleListFields,
} from '@/lib/recurring-invoice/display';
import { fetchDedupeKeysForInvoices, resolveNextReminderForInvoiceDisplay } from '@/lib/invoices/next-pending-reminder';
import { processScheduledInvoiceSends } from '@/lib/invoices/scheduled-invoice-send-cron';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { fetchAdminPlatformSettings, monthlyInvoiceLimitForPlan } from '@/lib/admin/admin-platform-settings';
import { featureUpgradeMessage, fetchActorLabelAndBillingPlan, hasPlanFeature } from '@/lib/billing/plans';
import { assertWorkspaceCoreWriteAccess } from '@/lib/billing/subscription-access';
import {
  createServerInvoiceSaveTimer,
  type InvoiceSaveServerSummaryMeta,
  voidLogAsyncDuration,
} from '@/lib/dev/invoice-save-timing';
import { syncSavedLineItemsFromUsage } from '@/lib/saved-line-items/sync-saved-line-items';
import {
  INVOICE_LIST_LEAN_COLS,
  INVOICE_LIST_LEAN_COLS_LEGACY,
  parseInvoiceListRequestParams,
} from '@/lib/invoices/invoice-list-sql-path';
import { runInvoiceListDataPipeline } from '@/lib/invoices/invoice-list-data-pipeline.server';
import { createInvoiceListServerPerf, invoiceTablePerfEnabled } from '@/lib/dev/invoice-table-perf';

export async function GET(req: Request) {
  const perf = createInvoiceListServerPerf();
  perf.mark('fetch_start');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

  const listPerm = await assertBusinessPermission(supabase, businessId, user.id, 'view_data');
  if (!listPerm.ok) return listPerm.response;

  const admin = getSupabaseServiceAdmin();
  if (admin) {
    void (async () => {
      try {
        await processScheduledInvoiceSends(admin, new Date(), { businessId });
      } catch (e) {
        console.error('[scheduled-invoice-send] list GET drain failed', e);
      }
    })();
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('id', businessId)
    .single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const { listParams, page, pageSize, wantExactCount } = parseInvoiceListRequestParams(searchParams);
  const pipeline = await runInvoiceListDataPipeline({
    supabase,
    business: business as { id: string; currency?: string | null },
    listParams,
    mode: {
      kind: 'list',
      page,
      pageSize,
      wantExactCount,
      perf,
      selectPrimary: INVOICE_LIST_LEAN_COLS,
      selectLegacy: INVOICE_LIST_LEAN_COLS_LEGACY,
    },
  });
  if (!pipeline.ok) {
    return NextResponse.json({ error: pipeline.error.message }, { status: 500 });
  }
  const { totalCount, useDbPage } = pipeline;
  const invoices = pipeline.invoices as Array<{
    id: string;
    recurring_rule_id?: string | null;
    status: string;
    total: number;
    amount_paid: number;
    balance_due: number;
    due_date: string;
    use_customer_reminder_defaults?: boolean;
    reminder_settings?: unknown;
    customer_reminder_settings?: unknown;
  }>;

  const pageIdsForRecurring = invoices.map((inv) => inv.id);
  const ruleIdsForRecurring = Array.from(
    new Set(invoices.map((i) => i.recurring_rule_id).filter((x): x is string => Boolean(x)))
  );

  const rulesById = new Map<string, RecurringRuleListFields>();
  const rulesBySource = new Map<string, RecurringRuleListFields>();

  if (ruleIdsForRecurring.length > 0) {
    const { data: fromIds } = await supabase
      .from('recurring_invoice_rules')
      .select('id, source_invoice_id, frequency, next_run_date, automation_mode, status')
      .eq('business_id', business.id)
      .in('id', ruleIdsForRecurring);
    for (const row of fromIds ?? []) {
      const o = row as RecurringRuleListFields;
      rulesById.set(String(o.id), o);
    }
  }
  if (pageIdsForRecurring.length > 0) {
    const { data: fromSource } = await supabase
      .from('recurring_invoice_rules')
      .select('id, source_invoice_id, frequency, next_run_date, automation_mode, status')
      .eq('business_id', business.id)
      .in('source_invoice_id', pageIdsForRecurring);
    for (const row of fromSource ?? []) {
      const o = row as RecurringRuleListFields;
      if (o.source_invoice_id) rulesBySource.set(String(o.source_invoice_id), o);
    }
  }

  const reminderKeys = await fetchDedupeKeysForInvoices(supabase, invoices.map((i) => i.id));
  const reminderNow = new Date();
  const invoicesOut = invoices.map((inv) => {
    const recurring = buildInvoiceRecurringSummary(
      inv.id,
      inv.recurring_rule_id,
      rulesById,
      rulesBySource
    );
    const { recurring_rule_id: _drop, ...rest } = inv;
    const sentKeys = reminderKeys.get(inv.id) ?? new Set();
    const next = resolveNextReminderForInvoiceDisplay({
      inv: {
        status: inv.status,
        total: inv.total,
        amount_paid: inv.amount_paid,
        balance_due: inv.balance_due,
        due_date: inv.due_date,
        use_customer_reminder_defaults: inv.use_customer_reminder_defaults,
        reminder_settings: inv.reminder_settings,
        customer_reminder_settings: inv.customer_reminder_settings,
      },
      sentDedupeKeys: sentKeys,
      now: reminderNow,
    });
    return { ...rest, recurring, next_reminder_at: next.next_reminder_at };
  });

  perf.mark('enrichment_done');
  perf.summary({
    useDbPage,
    exactCount: wantExactCount ? 1 : 0,
    totalCount,
    rowCount: invoicesOut.length,
  });

  const payload: Record<string, unknown> = { invoices: invoicesOut, totalCount };
  if (invoiceTablePerfEnabled()) {
    payload._debugInvoiceListPerf = { ...perf.devPayload(), useDbPage, exactCount: wantExactCount ? 1 : 0 };
  }
  return NextResponse.json(payload);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const postT = createServerInvoiceSaveTimer('POST');
    const body = (await req.json()) as Record<string, unknown>;
    const businessId = body.business_id;
    if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

    const parsed = createInvoiceBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    postT.mark('parse_and_validate');

    const { data: business } = await supabase
      .from('businesses')
      .select(
        'id, currency, owner_id, name, address_line1, city, state, country, email, phone, invoice_settings'
      )
      .eq('id', businessId)
      .single();
    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    postT.mark('load_business');

    const subGate = await assertWorkspaceCoreWriteAccess(
      supabase,
      String((business as { owner_id: string }).owner_id)
    );
    if (!subGate.ok) return subGate.response;
    postT.mark('subscription_gate');

    const ownerIdForRbac = String((business as { owner_id: string }).owner_id);
    const [readiness, createGate] = await Promise.all([
      assertInvoiceCreationReadiness(
        supabase,
        String(businessId),
        business as unknown as InvoiceReadinessBusinessRow
      ),
      assertBusinessPermission(
        supabase,
        String(businessId),
        user.id,
        'create_invoice',
        { knownOwnerId: ownerIdForRbac }
      ),
    ]);
    if (!readiness.ok) return readiness.response;
    if (!createGate.ok) {
      const manageGate = await assertBusinessPermission(
        supabase,
        String(businessId),
        user.id,
        'manage_invoices',
        { knownOwnerId: ownerIdForRbac }
      );
      if (!manageGate.ok) return manageGate.response;
    }
    postT.mark('readiness_and_create_permission_parallel');

    const { actorLabel, billingPlan } = await fetchActorLabelAndBillingPlan(supabase, user.id);
    const actorName = (actorLabel ?? user.email) ?? 'User';
    postT.mark('actor_name_and_billing_plan');

    const baseCur = String((business as { currency?: string }).currency ?? 'USD').toUpperCase();
    const p = parsed.data;
    const useReminderDef =
      (body as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== undefined
        ? Boolean((body as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults)
        : true;
    const reminderParsed =
      parseInvoiceReminderSettings((body as { reminder_settings?: unknown }).reminder_settings) ?? {};
    const reminderRow = serializeInvoiceReminderSettings(reminderParsed, {
      useCustomerDefaults: useReminderDef,
    });
    const customReminderRequested =
      !useReminderDef || Object.keys(reminderParsed as Record<string, unknown>).length > 0;
    const customerName = String(p.customer_name ?? '').trim();
    let subtotal = 0;
    let lineTaxTotal = 0;
    for (const i of p.items) {
      const lineTotal = i.quantity * i.unit_price;
      subtotal += lineTotal;
      const lineTaxPct = (i as { tax_percent?: number }).tax_percent ?? 0;
      lineTaxTotal += lineTotal * (lineTaxPct / 100);
    }
    const discountAmount = resolveDiscountAmount(subtotal, {
      discount_amount: p.discount_amount,
      discount_percent: p.discount_percent,
    });
    const afterDiscount = subtotal - discountAmount;
    const invoiceTaxAmount =
      p.tax_amount ?? (p.tax_percent != null ? afterDiscount * (p.tax_percent / 100) : 0);
    const total = afterDiscount + invoiceTaxAmount + lineTaxTotal;
    const invCur = (p.currency ?? baseCur).toUpperCase();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const nextMonthStart = new Date(monthStart);
    nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);
    postT.mark('totals_compute_local');
    const adminClient = getSupabaseServiceAdmin();
    const platformInv = adminClient ? await fetchAdminPlatformSettings(adminClient) : null;
    const monthlyCap = platformInv ? monthlyInvoiceLimitForPlan(billingPlan, platformInv) : null;
    if (monthlyCap != null) {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', nextMonthStart.toISOString());
      if ((count ?? 0) >= monthlyCap) {
        return NextResponse.json(
          {
            error: `You've reached your plan limit of ${monthlyCap} invoices this month. Upgrade to continue.`,
            code: 'plan_limit_invoice_count',
            current_plan: billingPlan,
            cta: 'Upgrade',
          },
          { status: 403 }
        );
      }
    }
    postT.mark('platform_and_monthly_invoice_count');
    if (invCur !== baseCur && !hasPlanFeature(billingPlan, 'multi_currency')) {
      return NextResponse.json(
        {
          error: featureUpgradeMessage('multi_currency'),
          code: 'plan_feature_multi_currency',
          current_plan: billingPlan,
          cta: 'Upgrade',
        },
        { status: 403 }
      );
    }
    const taxCombined = invoiceTaxAmount + lineTaxTotal;
    let fxRate = 1;
    try {
      fxRate = await resolveExchangeRateToBase(invCur, baseCur, p.exchange_rate_to_base ?? null);
    } catch {
      if (invCur !== baseCur) {
        return NextResponse.json(
          { error: 'Could not fetch exchange rate. Set exchange_rate_to_base or use the company base currency.' },
          { status: 400 }
        );
      }
    }
    postT.mark('resolve_fx');
    const fxRow = buildInvoiceFxRow(baseCur, fxRate, subtotal, taxCombined, total);

    // Payment schedule (optional): validate sum equals invoice total, and use latest scheduled due date.
    const useSchedule = !!p.use_payment_schedule;
    type ScheduleInsertRow = Record<string, unknown>;
    let schedule: ScheduleInsertRow[] = [];
    if (useSchedule) {
      if (!hasPlanFeature(billingPlan, 'automation')) {
        return NextResponse.json(
          {
            error: featureUpgradeMessage('automation'),
            code: 'plan_feature_automation',
            current_plan: billingPlan,
            cta: 'Upgrade',
          },
          { status: 403 }
        );
      }
      const rawSnake = p.payment_schedule;
      const rawCamel = body.paymentSchedule;
      if (Array.isArray(rawCamel) && rawCamel.length > 0) {
        schedule = normalizeClientPaymentScheduleCamel(rawCamel as unknown[]);
      } else if (Array.isArray(rawSnake) && rawSnake.length > 0) {
        schedule = rawSnake as ScheduleInsertRow[];
      }
      if (schedule.length < 1) {
        return NextResponse.json({ error: 'Payment schedule must include at least one row.' }, { status: 400 });
      }
      const sum = schedule.reduce(
        (s: number, r) => s + Number(r.amount ?? 0),
        0
      );
      if (Math.abs(sum - total) > 0.05) {
        return NextResponse.json({ error: 'Payment schedule amounts must sum to invoice total.' }, { status: 400 });
      }
    }
    if (customReminderRequested && !hasPlanFeature(billingPlan, 'automation')) {
      return NextResponse.json(
        {
          error: featureUpgradeMessage('automation'),
          code: 'plan_feature_automation',
          current_plan: billingPlan,
          cta: 'Upgrade',
        },
        { status: 403 }
      );
    }

    const { data: invNum } = await supabase.rpc('next_invoice_number', {
      p_business_id: business.id,
    });
    const invoiceNumber = (invNum as string) ?? 'INV-00001';
    postT.mark('next_invoice_number_rpc');

    let customerId = p.customer_id ?? null;
    if (!customerId && customerName) {
      const existing = await findExistingCustomer(supabase, business.id, {
        company: customerName,
        name: customerName,
        email: p.customer_email ?? null,
      });
      if (existing?.id) customerId = existing.id;
    }
    postT.mark('customer_find_dedupe');

    const { data: selectedCustomer } = customerId
      ? await supabase
          .from('customers')
          .select(
            'name, company, email, phone, address_line1, address_line2, city, state, postal_code, country'
          )
          .eq('id', customerId)
          .eq('business_id', business.id)
          .maybeSingle()
      : { data: null as null };
    postT.mark('customer_row_select');

    const billingLine1 =
      p.client_billing?.billing_address_line1 ??
      (selectedCustomer as { address_line1?: string | null } | null)?.address_line1 ??
      null;
    const billingLine2 =
      p.client_billing?.billing_address_line2 ??
      (selectedCustomer as { address_line2?: string | null } | null)?.address_line2 ??
      null;
    const billingAddressCombined =
      p.client_billing?.billing_address ??
      ([billingLine1, billingLine2].filter(Boolean).join(', ').trim() || null);
    const metadata =
      p.client_billing || selectedCustomer
        ? {
            contact_person:
              p.client_billing?.contact_person ??
              (selectedCustomer as { name?: string | null } | null)?.name ??
              null,
            company:
              p.client_billing?.company ??
              (selectedCustomer as { company?: string | null } | null)?.company ??
              null,
            billing_address_line1: billingLine1,
            billing_address_line2: billingLine2,
            billing_address: billingAddressCombined,
            billing_city:
              p.client_billing?.billing_city ??
              (selectedCustomer as { city?: string | null } | null)?.city ??
              null,
            billing_state:
              p.client_billing?.billing_state ??
              (selectedCustomer as { state?: string | null } | null)?.state ??
              null,
            billing_postal_code:
              p.client_billing?.billing_postal_code ??
              (selectedCustomer as { postal_code?: string | null } | null)?.postal_code ??
              null,
            billing_country:
              p.client_billing?.billing_country ??
              (selectedCustomer as { country?: string | null } | null)?.country ??
              null,
            billing_phone:
              p.client_billing?.billing_phone ??
              (selectedCustomer as { phone?: string | null } | null)?.phone ??
              null,
            use_delivery_address: !!p.client_billing?.use_delivery_address,
            ...(p.client_billing?.use_delivery_address
              ? {
                  delivery_company: p.client_billing.delivery_company ?? null,
                  delivery_contact_person: p.client_billing.delivery_contact_person ?? null,
                  delivery_email: p.client_billing.delivery_email ?? null,
                  delivery_phone: p.client_billing.delivery_phone ?? null,
                  delivery_address: p.client_billing.delivery_address ?? null,
                  delivery_city: p.client_billing.delivery_city ?? null,
                  delivery_state: p.client_billing.delivery_state ?? null,
                  delivery_postal_code: p.client_billing.delivery_postal_code ?? null,
                  delivery_country: p.client_billing.delivery_country ?? null,
                }
              : {}),
          }
        : null;

    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert({
        business_id: business.id,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: p.customer_email ?? null,
        status: 'draft',
        invoice_number: invoiceNumber,
        issue_date: p.issue_date ?? new Date().toISOString().slice(0, 10),
        due_date: useSchedule
          ? schedule
              .map((r) => String(r.due_date ?? ''))
              .sort()
              .slice(-1)[0]
          : p.due_date,
        currency: invCur,
        ...fxRow,
        subtotal,
        tax_amount: taxCombined,
        total,
        notes: p.notes ?? null,
        theme_id: p.theme_id ?? null,
        template_id: normalizeInvoiceTemplateId(p.template_id),
        reference_po: p.reference_po ?? null,
        discount_amount: discountAmount,
        terms: p.terms ?? null,
        metadata,
        use_payment_schedule: useSchedule,
        amount_paid: 0,
        balance_due: total,
        use_customer_reminder_defaults: useReminderDef,
        reminder_settings: reminderRow,
        show_time_summary: p.show_time_summary ?? false,
      })
      .select()
      .single();

    if (invError || !invoice) {
      const msg = invError?.message ?? 'Create failed';
      const hint = /discount_amount|reference_po|terms|metadata|tax_percent|column.*does not exist/i.test(msg)
        ? ' Run the migration: Supabase SQL Editor → paste and run supabase/migrations/006_invoices_pricing_and_metadata.sql, then restart the dev server.'
        : '';
      return NextResponse.json({ error: msg + hint }, { status: 500 });
    }
    postT.mark('invoice_row_insert');
    const _idSuf = String((invoice as { id?: string }).id ?? '').length >= 4
      ? String((invoice as { id?: string }).id).slice(-4)
      : '****';

    const lineRows = p.items.map((item, i) => {
      const taxPct = (item as { tax_percent?: number }).tax_percent ?? 0;
      const amount = item.quantity * item.unit_price;
      return {
        invoice_id: invoice.id,
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount,
        unit_label: normalizeInvoiceUnitLabel(item.unit_label ?? 'item'),
        sort_order: i,
        tax_percent: taxPct,
        assignee: normalizeInvoiceAssignee((item as { assignee?: unknown }).assignee),
      };
    });
    if (lineRows.length > 0) {
      const { error: lineErr } = await supabase.from('invoice_items').insert(lineRows);
      if (lineErr) {
        return NextResponse.json({ error: lineErr.message ?? 'Failed to save line items' }, { status: 500 });
      }
    }
    postT.mark('line_items_insert');
    {
      const syncP = syncSavedLineItemsFromUsage(supabase, {
        businessId: String(business.id),
        currency: invCur,
        items: p.items.map((it) => ({
          name: it.name,
          description: it.description ?? null,
          unit_label: (it as { unit_label?: string | null }).unit_label,
          unit_price: it.unit_price,
          tax_percent: (it as { tax_percent?: number | null }).tax_percent ?? 0,
        })),
      });
      voidLogAsyncDuration('saved_line_items', syncP);
      void syncP.catch((e) => console.error('[saved-line-items]', e));
    }

    if (useSchedule) {
      const schedRows = schedule.map((row) => ({
        invoice_id: invoice.id,
        description: String(row.description ?? ''),
        amount: Number(row.amount),
        due_date: row.due_date,
        status: (row.status as string | undefined) ?? 'pending',
      }));
      const { error: schedErr } = await supabase.from('invoice_payment_schedule_items').insert(schedRows);
      if (schedErr) {
        return NextResponse.json({ error: schedErr.message ?? 'Failed to save payment schedule' }, { status: 500 });
      }
    }
    postT.mark(useSchedule ? 'payment_schedule_batch_insert' : 'payment_schedule_skipped');

    const draftLogPayload = {
      supabase,
      businessId: business.id,
      performedByUserId: user.id,
      performedByName: actorName,
      invoiceId: String(invoice.id),
      invoiceNumber,
      customerName,
      total: Number(total),
      currencyCode: invCur,
      source: 'manual' as const,
      hasPaymentSchedule: useSchedule && schedule.length > 0,
    };
    const logP = logInvoiceDraftCreated(draftLogPayload);
    voidLogAsyncDuration('log_invoice_draft_activity_notify', logP);
    void logP.catch((e) => {
      console.error('[invoice POST] logInvoiceDraftCreated', e);
    });
    postT.mark('return_async_activity_started');

    let customerMode: InvoiceSaveServerSummaryMeta['customerMode'] = 'none';
    if (p.customer_id) customerMode = 'lookup_only';
    else if (customerId) customerMode = 'lookup_deduped';
    else customerMode = 'new_or_unlinked';
    postT.summary({
      lineItemCount: p.items.length,
      customerMode,
      hasPaymentSchedule: useSchedule,
      invoiceIdSuffix: _idSuf,
    });

    return NextResponse.json(invoice);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
