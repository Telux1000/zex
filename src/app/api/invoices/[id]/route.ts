import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createActivity, createPaymentActivity, getChangedInvoiceFields } from '@/lib/activity';
import {
  logAuditEvent,
  resolveActorDisplayName,
  type AuditAction,
  type InvoiceMutationSource,
} from '@/lib/audit-log';
import { buildInvoiceEmailSubject } from '@/lib/invoices/email-subject';
import { notifyBusinessEvent } from '@/services/notifications';
import { canEdit, canEditFully, canEditPaymentSchedule, isLocked } from '@/lib/invoices/edit-rules';
import { resolveDiscountAmount } from '@/lib/validations/invoice';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { buildInvoiceFxRow, resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';
import { canEditInvoiceCurrency, normalizeInvoiceCurrencyFields } from '@/lib/invoices/currency-edit';
import { normalizeClientPaymentScheduleCamel } from '@/lib/invoices/normalize-client-payment-schedule';
import {
  parseInvoiceReminderSettings,
  resolveEffectiveReminderConfig,
  serializeInvoiceReminderSettings,
  type InvoiceReminderSettings,
} from '@/lib/invoices/reminder-settings';
import {
  effectiveReminderMeaningful,
  reminderConfigFingerprint,
} from '@/lib/invoices/next-pending-reminder';
import {
  validateReminderTimingRows,
  validateScheduledReminderIso,
} from '@/lib/invoices/auto-reminders-modal-validation';
import { validateIsoInstantStrictlyInFuture } from '@/lib/invoices/future-instant-validation';
import {
  normalizeBusinessTimezone,
  SCHEDULE_PAST_ERROR,
  wallTimeToUtcIso,
} from '@/lib/invoices/scheduled-send-time';
import { canManageAutoReminders } from '@/lib/invoices/auto-reminders-eligibility';
import { withSyncedPublicCustomerSnapshot } from '@/lib/invoices/invoice-public-customer';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { normalizeInvoiceAssignee } from '@/lib/invoices/invoice-time-summary';
import { processScheduledInvoiceSends } from '@/lib/invoices/scheduled-invoice-send-cron';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  assertWorkspaceCoreWriteAccess,
  isInvoiceIssuancePayload,
} from '@/lib/billing/subscription-access';
import { computeInvoiceBalanceDue, resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { hasPermission } from '@/lib/rbac/permissions';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';

function scheduleRowType(description: string): 'deposit' | 'installment' {
  const t = String(description ?? '').trim().toLowerCase();
  if (t === 'deposit' || t.startsWith('deposit ')) return 'deposit';
  return 'installment';
}

function buildPaymentScheduleResponse(items: unknown, invoiceTotal: number): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) return [];
  return items.map((raw, index) => {
    const r = raw as Record<string, unknown>;
    const amount = Number(r.amount ?? 0);
    const desc = String(r.description ?? '');
    return {
      id: String(r.id ?? ''),
      type: scheduleRowType(desc),
      description: desc,
      amount,
      dueDate: r.due_date != null ? String(r.due_date).slice(0, 10) : '',
      status: r.status === 'paid' ? 'paid' : 'unpaid',
      sequence: index,
      percentage: invoiceTotal > 0 ? Math.round((amount / invoiceTotal) * 10000) / 100 : null,
    };
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), invoice_payment_schedule_items(*), businesses(*), invoice_themes(*)')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const embed = data.businesses as { owner_id: string; id: string } | { owner_id: string; id: string }[] | null;
  const business = Array.isArray(embed)
    ? embed.length === 1
      ? embed[0]!
      : null
    : embed;
  if (!business || !business.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const role = await getEffectiveBusinessRole(supabase, business.id, user.id);
  if (!role || !hasPermission(role, 'view_data')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseServiceAdmin();
  if (admin) {
    const raw = data as { status?: string; scheduled_send_at?: string | null };
    if (String(raw.status ?? '').toLowerCase() === 'draft' && raw.scheduled_send_at?.trim()) {
      const dueMs = Date.parse(String(raw.scheduled_send_at));
      if (!Number.isNaN(dueMs) && dueMs <= Date.now()) {
        try {
          await processScheduledInvoiceSends(admin, new Date(), { businessId: business.id });
        } catch (e) {
          console.error('[scheduled-invoice-send] GET invoice drain failed', e);
        }
        const { data: fresh } = await supabase.from('invoices').select('*').eq('id', id).single();
        if (fresh) {
          Object.assign(data, fresh);
        }
      }
    }
  }

  const total = Number((data as any).total ?? 0);
  const amountPaid = Number((data as any).amount_paid ?? 0);
  const totalRefunded = Number((data as any).total_refunded ?? 0);
  const rawSt = String((data as any).status ?? '').toLowerCase();
  const balanceDue =
    rawSt === 'voided' || rawSt === 'cancelled'
      ? 0
      : resolveInvoiceBalanceDue({
          status: rawSt,
          total,
          amount_paid: amountPaid,
          total_refunded: totalRefunded,
        });

  return NextResponse.json({
    ...data,
    balance_due: balanceDue,
    status: deriveInvoiceStatus({
      status: (data as any).status,
      total,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      total_refunded: totalRefunded,
    }),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, customer_id, customer_name, due_date, status, currency, base_currency_code, exchange_rate_to_base, subtotal, tax_amount, total, amount_paid, balance_due, total_refunded, use_customer_reminder_defaults, reminder_settings, use_payment_schedule'
    )
    .eq('id', id)
    .single();

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const prevAmountPaid = Number((invoice as any).amount_paid ?? 0);

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency, timezone')
    .eq('id', invoice.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const businessTimezone = normalizeBusinessTimezone((business as { timezone?: string | null }).timezone);

  const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';

  const status = deriveInvoiceStatus({
    status: invoice.status as string,
    total: Number((invoice as any).total ?? 0),
    amount_paid: Number((invoice as any).amount_paid ?? 0),
    balance_due: (invoice as any).balance_due != null ? Number((invoice as any).balance_due) : null,
    total_refunded: Number((invoice as any).total_refunded ?? 0),
  });

  if (isLocked(status)) {
    return NextResponse.json(
      { error: 'Paid and voided invoices cannot be edited. Use a credit note to make adjustments.' },
      { status: 403 }
    );
  }

  if (!canEdit(status)) {
    return NextResponse.json({ error: 'This invoice cannot be edited.' }, { status: 403 });
  }

  const body = await req.json();

  const { data: bizForSub } = await supabase
    .from('businesses')
    .select('owner_id')
    .eq('id', invoice.business_id)
    .maybeSingle();
  if (
    bizForSub &&
    isInvoiceIssuancePayload(body as Record<string, unknown>, String((invoice as { status?: string }).status ?? ''))
  ) {
    const subGate = await assertWorkspaceCoreWriteAccess(
      supabase,
      String((bizForSub as { owner_id: string }).owner_id)
    );
    if (!subGate.ok) return subGate.response;
  }
  const reminderTouchedEarly =
    body.use_customer_reminder_defaults !== undefined || body.reminder_settings !== undefined;
  const rawMutationSrc = body.mutation_source;
  const mutationSource: InvoiceMutationSource =
    rawMutationSrc === 'assistant' || rawMutationSrc === 'api' || rawMutationSrc === 'manual'
      ? rawMutationSrc
      : 'manual';
  const invAuditMeta = (meta: Record<string, unknown>) => ({ ...meta, source: mutationSource });

  const beforeSnapshot = {
    total: Number((invoice as any).total ?? 0),
    due_date: String((invoice as any).due_date ?? ''),
    currency: String((invoice as any).currency ?? ''),
    customer_id: String((invoice as any).customer_id ?? ''),
    customer_name: String((invoice as any).customer_name ?? ''),
    status,
  };

  const allowedFully = [
    'customer_name', 'customer_email', 'customer_id', 'due_date', 'issue_date', 'notes', 'theme_id',
    'status', 'subtotal', 'tax_amount', 'total',
    'discount_amount', 'reference_po', 'terms', 'metadata',
    'currency',
    'show_time_summary',
  ];
  const allowedRestricted = ['notes', 'reference_po', 'terms', 'status'];

  const allowed = canEditFully(status) ? allowedFully : allowedRestricted;
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  const serviceAdmin = getSupabaseServiceAdmin();
  const platformSettings = serviceAdmin ? await fetchAdminPlatformSettings(serviceAdmin) : null;

  if (reminderTouchedEarly) {
    if (platformSettings && !platformSettings.feature_reminders_enabled) {
      return NextResponse.json(
        {
          error: 'Invoice reminders are turned off for this platform.',
          code: 'feature_reminders_disabled',
        },
        { status: 403 }
      );
    }
    const reminderEligible = canManageAutoReminders({
      status: invoice.status as string,
      total: Number((invoice as { total?: number }).total ?? 0),
      amount_paid: Number((invoice as { amount_paid?: number }).amount_paid ?? 0),
      balance_due:
        (invoice as { balance_due?: number | null }).balance_due != null
          ? Number((invoice as { balance_due?: number }).balance_due)
          : null,
    });
    if (!reminderEligible) {
      return NextResponse.json(
        { error: 'Reminder settings can only be updated for sent invoices with an open balance.' },
        { status: 403 }
      );
    }
    const currentUse =
      (invoice as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false;
    const nextUse =
      body.use_customer_reminder_defaults !== undefined
        ? Boolean(body.use_customer_reminder_defaults)
        : currentUse;
    const currentRem =
      parseInvoiceReminderSettings((invoice as { reminder_settings?: unknown }).reminder_settings) ?? {};
    const merged: InvoiceReminderSettings = { ...currentRem };
    if (body.reminder_settings !== undefined) {
      const raw = body.reminder_settings as unknown;
      let asObj: unknown = raw;
      if (typeof raw === 'string') {
        try {
          asObj = JSON.parse(raw) as unknown;
        } catch {
          return NextResponse.json({ error: 'Invalid reminder_settings JSON' }, { status: 400 });
        }
      }
      const parsed = parseInvoiceReminderSettings(asObj);
      if (parsed) {
        if (parsed.scheduledReminderAt !== undefined) merged.scheduledReminderAt = parsed.scheduledReminderAt;
        if (parsed.automaticReminders !== undefined) merged.automaticReminders = parsed.automaticReminders;
        if (parsed.reminderTiming !== undefined) merged.reminderTiming = parsed.reminderTiming;
      }
    }
    const nowServer = new Date();
    const dueStr = String((invoice as { due_date?: string }).due_date ?? '');
    const schedCheck = validateScheduledReminderIso(merged.scheduledReminderAt ?? null, nowServer);
    if (!schedCheck.ok) {
      return NextResponse.json({ error: schedCheck.error }, { status: 400 });
    }
    if (
      !nextUse &&
      merged.automaticReminders &&
      Array.isArray(merged.reminderTiming) &&
      merged.reminderTiming.length > 0
    ) {
      const timingCheck = validateReminderTimingRows(merged.reminderTiming, dueStr, nowServer);
      if (!timingCheck.ok) {
        const first = Array.from(timingCheck.rowErrors.values())[0];
        return NextResponse.json({ error: first ?? 'Invalid reminder timing.' }, { status: 400 });
      }
    }

    updates.use_customer_reminder_defaults = nextUse;
    updates.reminder_settings = serializeInvoiceReminderSettings(merged, {
      useCustomerDefaults: nextUse,
    });
  }

  if (
    body.scheduled_send_at !== undefined ||
    body.scheduled_send_date !== undefined ||
    body.scheduled_send_time !== undefined
  ) {
    if (!canEditFully(status)) {
      return NextResponse.json({ error: 'Scheduled send cannot be updated for this invoice.' }, { status: 403 });
    }
    const rawSt = String((invoice as { status?: string }).status ?? '').toLowerCase();
    if (rawSt !== 'draft') {
      return NextResponse.json(
        { error: 'Scheduled send can only be set for draft invoices.' },
        { status: 400 }
      );
    }
    if (body.scheduled_send_at === null) {
      updates.scheduled_send_at = null;
      updates.scheduled_send_timezone = null;
    } else {
      if (platformSettings && !platformSettings.feature_scheduled_send_enabled) {
        return NextResponse.json(
          {
            error: 'Scheduled invoice sending is turned off for this platform.',
            code: 'feature_scheduled_send_disabled',
          },
          { status: 403 }
        );
      }
      const dateStr = body.scheduled_send_date;
      const timeStr = body.scheduled_send_time;
      const hasLocal =
        typeof dateStr === 'string' &&
        String(dateStr).trim() !== '' &&
        typeof timeStr === 'string' &&
        String(timeStr).trim() !== '';

      let isoOut: string;
      if (hasLocal) {
        try {
          isoOut = wallTimeToUtcIso(String(dateStr).trim(), String(timeStr).trim(), businessTimezone);
        } catch {
          return NextResponse.json({ error: 'Invalid scheduled send time.' }, { status: 400 });
        }
      } else if (body.scheduled_send_at !== undefined && body.scheduled_send_at !== null) {
        const iso = String(body.scheduled_send_at).trim();
        const t = Date.parse(iso);
        if (Number.isNaN(t)) {
          return NextResponse.json({ error: 'Invalid scheduled send time.' }, { status: 400 });
        }
        isoOut = new Date(t).toISOString();
      } else {
        return NextResponse.json(
          {
            error:
              'Provide both scheduled_send_date and scheduled_send_time (your account timezone is applied on the server).',
          },
          { status: 400 }
        );
      }

      const leadMin = platformSettings?.scheduling_min_lead_minutes ?? 60;
      const minLeadMs = leadMin * 60 * 1000;
      const scheduleInstant = validateIsoInstantStrictlyInFuture(isoOut, new Date(), {
        pastMessage: SCHEDULE_PAST_ERROR,
        invalidIsoMessage: 'Invalid scheduled send time.',
        minLeadMs,
        tooSoonMessage: `Scheduled send must be at least ${leadMin} minutes from now.`,
      });
      if (!scheduleInstant.ok) {
        return NextResponse.json({ error: scheduleInstant.error }, { status: 400 });
      }
      updates.scheduled_send_at = isoOut;
      updates.scheduled_send_timezone = businessTimezone;
    }
  }

  if (updates.customer_name !== undefined) {
    const nextName = String(updates.customer_name ?? '').trim();
    updates.customer_name = nextName;
  }

  if (updates.status === 'voided') {
    updates.status = 'voided';
    updates.balance_due = 0;
    const reason =
      typeof body.void_reason === 'string' ? body.void_reason.trim() : '';
    const { data: currentInvoice } = await supabase
      .from('invoices')
      .select('metadata')
      .eq('id', id)
      .single();
    const existingMeta = (currentInvoice?.metadata as Record<string, unknown>) ?? {};
    updates.metadata = {
      ...existingMeta,
      voided_at: new Date().toISOString(),
      ...(reason ? { void_reason: reason } : {}),
    };
  }

  if (canEditFully(status) && body.client_billing !== undefined) {
    const b = body.client_billing as Record<string, unknown> | null;
    const useDeliveryAddress = !!(b && typeof b === 'object' && b.use_delivery_address);
    const billingLine1 = b && typeof b === 'object' ? (b.billing_address_line1 ?? null) : null;
    const billingLine2 = b && typeof b === 'object' ? (b.billing_address_line2 ?? null) : null;
    const billingCombined =
      b && typeof b === 'object'
        ? (b.billing_address ?? ([billingLine1, billingLine2].filter(Boolean).join(', ').trim() || null))
        : null;
    const clientBilling =
      b && typeof b === 'object'
        ? {
            contact_person: b.contact_person ?? null,
            company: b.company ?? null,
            billing_address_line1: billingLine1,
            billing_address_line2: billingLine2,
            billing_address: billingCombined,
            billing_city: b.billing_city ?? null,
            billing_state: b.billing_state ?? null,
            billing_postal_code: b.billing_postal_code ?? null,
            billing_country: b.billing_country ?? null,
            billing_phone: b.billing_phone ?? null,
            use_delivery_address: useDeliveryAddress,
            delivery_contact_person: useDeliveryAddress ? (b.delivery_contact_person ?? null) : null,
            delivery_company: useDeliveryAddress ? (b.delivery_company ?? null) : null,
            delivery_email: useDeliveryAddress ? (b.delivery_email ?? null) : null,
            delivery_phone: useDeliveryAddress ? (b.delivery_phone ?? null) : null,
            delivery_address: useDeliveryAddress ? (b.delivery_address ?? null) : null,
            delivery_city: useDeliveryAddress ? (b.delivery_city ?? null) : null,
            delivery_state: useDeliveryAddress ? (b.delivery_state ?? null) : null,
            delivery_postal_code: useDeliveryAddress ? (b.delivery_postal_code ?? null) : null,
            delivery_country: useDeliveryAddress ? (b.delivery_country ?? null) : null,
          }
        : null;
    const { data: currentInvoice } = await supabase
      .from('invoices')
      .select('metadata')
      .eq('id', id)
      .single();
    const existingMeta = (currentInvoice?.metadata as Record<string, unknown>) ?? {};
    updates.metadata = {
      ...existingMeta,
      ...(clientBilling ?? {}),
    };
  }

  if (canEditFully(status) && updates.customer_id !== undefined) {
    const nextCustomerId = String(updates.customer_id ?? '').trim();
    if (nextCustomerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select(
          'name, company, email, phone, address_line1, address_line2, city, state, postal_code, country'
        )
        .eq('id', nextCustomerId)
        .eq('business_id', String((invoice as any).business_id))
        .maybeSingle();
      if (customer) {
        const { data: currentInvoice } = await supabase
          .from('invoices')
          .select('metadata')
          .eq('id', id)
          .single();
        const existingMeta = (currentInvoice?.metadata as Record<string, unknown>) ?? {};
        const line1 = String((customer as any).address_line1 ?? '').trim() || null;
        const line2 = String((customer as any).address_line2 ?? '').trim() || null;
        const combinedAddress = [line1, line2].filter(Boolean).join(', ') || null;
        updates.customer_name = String((customer as any).company || (customer as any).name || '').trim();
        updates.customer_email = String((customer as any).email ?? '').trim() || null;
        updates.metadata = {
          ...existingMeta,
          ...(updates.metadata as Record<string, unknown> | undefined),
          contact_person: String((customer as any).name ?? '').trim() || null,
          company: String((customer as any).company ?? '').trim() || null,
          billing_address_line1: line1,
          billing_address_line2: line2,
          billing_address: combinedAddress,
          billing_city: String((customer as any).city ?? '').trim() || null,
          billing_state: String((customer as any).state ?? '').trim() || null,
          billing_postal_code: String((customer as any).postal_code ?? '').trim() || null,
          billing_country: String((customer as any).country ?? '').trim() || null,
          billing_phone: String((customer as any).phone ?? '').trim() || null,
        };
      }
    }
  }

  const items = canEditFully(status) && Array.isArray(body.items) ? body.items : null;
  const canMutateSchedule = canEdit(status) && canEditPaymentSchedule(status);
  const useSchedule = canMutateSchedule && !!body.use_payment_schedule;
  let schedule: unknown[] | null = null;
  const rawSnake = body.payment_schedule;
  const rawCamel = (body as { paymentSchedule?: unknown }).paymentSchedule;
  // Prefer camelCase paymentSchedule when present — it is the explicit client payload and avoids
  // stale payment_schedule winning when both are sent.
  if (canMutateSchedule && Array.isArray(rawCamel) && (rawCamel as unknown[]).length > 0) {
    schedule = normalizeClientPaymentScheduleCamel(
      (body as { paymentSchedule: unknown[] }).paymentSchedule
    );
  } else if (canMutateSchedule && Array.isArray(rawSnake) && rawSnake.length > 0) {
    schedule = rawSnake;
  }

  if (items) {
    let computedSubtotal = 0;
    for (const it of items) {
      computedSubtotal += Number(it.quantity ?? 0) * Number(it.unit_price ?? 0);
    }
    updates.subtotal = Math.round(computedSubtotal * 100) / 100;
    updates.discount_amount = Math.round(
      resolveDiscountAmount(computedSubtotal, {
        discount_amount: body.discount_amount,
        discount_percent: body.discount_percent,
      }) * 100
    ) / 100;
    if (body.tax_amount !== undefined) updates.tax_amount = Number(body.tax_amount);
    if (body.total !== undefined) updates.total = Number(body.total);
  }

  if (canMutateSchedule && (body.use_payment_schedule !== undefined || schedule)) {
    updates.use_payment_schedule = useSchedule;
  }

  if (updates.status !== 'voided') {
    const nextTotal = Number(updates.total ?? (invoice as any).total ?? 0);
    const nextAmountPaid = Number((invoice as any).amount_paid ?? 0);
    const nextBalanceDue =
      updates.balance_due != null
        ? Number(updates.balance_due)
        : computeInvoiceBalanceDue(nextTotal, nextAmountPaid);
    updates.status = deriveInvoiceStatus({
      status: String(updates.status ?? status),
      total: nextTotal,
      amount_paid: nextAmountPaid,
      balance_due: nextBalanceDue,
    });
  }

  // If using a schedule, validate sum equals invoice total and set due_date to latest schedule due_date.
  if (useSchedule) {
    const total = Number(
      updates.total ?? body.total ?? (invoice as { total?: number }).total ?? 0
    );
    if (!schedule || schedule.length < 1) {
      return NextResponse.json({ error: 'Payment schedule must include at least one row.' }, { status: 400 });
    }
    const sum = schedule.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    if (Math.abs(sum - total) > 0.12) {
      return NextResponse.json({ error: 'Payment schedule amounts must sum to invoice total.' }, { status: 400 });
    }
    for (const r of schedule as Array<Record<string, unknown>>) {
      if (!String(r.description ?? '').trim()) {
        return NextResponse.json({ error: 'Each payment schedule row requires a description.' }, { status: 400 });
      }
      if (!String(r.due_date ?? '').trim()) {
        return NextResponse.json({ error: 'Each payment schedule row requires a due date.' }, { status: 400 });
      }
      if (!(Number(r.amount) > 0)) {
        return NextResponse.json({ error: 'Each payment schedule row must have a positive amount.' }, { status: 400 });
      }
    }
    updates.due_date = schedule.map((r: any) => String(r.due_date)).sort().slice(-1)[0];
  }

  const rawDbStatus = String((invoice as { status?: string }).status ?? '');
  const isDraft = canEditInvoiceCurrency(rawDbStatus);
  const baseCurBiz = String((business as { currency?: string }).currency ?? 'USD').toUpperCase();
  const prevCur = String((invoice as { currency?: string }).currency ?? 'USD').toUpperCase();
  const nextCur = String(updates.currency ?? prevCur).toUpperCase();
  const sub = Number(updates.subtotal ?? (invoice as { subtotal?: number }).subtotal ?? 0);
  const tax = Number(updates.tax_amount ?? (invoice as { tax_amount?: number }).tax_amount ?? 0);
  const tot = Number(updates.total ?? (invoice as { total?: number }).total ?? 0);
  const monetaryChanged =
    !!items ||
    updates.subtotal != null ||
    updates.tax_amount != null ||
    updates.total != null;
  const currencyChanged = updates.currency != null && nextCur !== prevCur;

  if (!isDraft) {
    delete updates.currency;
    delete updates.base_currency_code;
    delete updates.exchange_rate_to_base;
    const lockedRate = Number((invoice as { exchange_rate_to_base?: number }).exchange_rate_to_base ?? 1);
    const baseCode = String(
      (invoice as { base_currency_code?: string }).base_currency_code || baseCurBiz
    ).toUpperCase();
    if (monetaryChanged) {
      const fx = normalizeInvoiceCurrencyFields(
        {
          currency: prevCur,
          base_currency_code: baseCode,
          exchange_rate_to_base: lockedRate,
          subtotal: sub,
          tax_amount: tax,
          total: tot,
        },
        baseCode
      );
      Object.assign(updates, {
        currency: String(fx.currency),
        ...buildInvoiceFxRow(
          String(fx.base_currency_code),
          Number(fx.exchange_rate_to_base),
          Number(fx.subtotal),
          Number(fx.tax_amount),
          Number(fx.total)
        ),
      });
    }
  } else if (canEditFully(status)) {
    const baseCur = baseCurBiz;
    let rate: number;
    if (
      !monetaryChanged &&
      !currencyChanged &&
      !body.refresh_exchange_rate &&
      body.exchange_rate_to_base == null
    ) {
      rate = Number((invoice as { exchange_rate_to_base?: number }).exchange_rate_to_base ?? 1);
    } else {
      try {
        rate = await resolveExchangeRateToBase(
          nextCur,
          baseCur,
          body.exchange_rate_to_base != null ? Number(body.exchange_rate_to_base) : null
        );
      } catch {
        if (nextCur !== baseCur) {
          return NextResponse.json(
            {
              error:
                'Could not refresh exchange rate. Set exchange_rate_to_base or match company base currency.',
            },
            { status: 400 }
          );
        }
        rate = 1;
      }
    }
    const fx = normalizeInvoiceCurrencyFields(
      {
        currency: nextCur,
        base_currency_code: baseCur,
        exchange_rate_to_base: rate,
        subtotal: sub,
        tax_amount: tax,
        total: tot,
      },
      baseCur
    );
    Object.assign(updates, {
      currency: String(fx.currency),
      ...buildInvoiceFxRow(
        String(fx.base_currency_code),
        Number(fx.exchange_rate_to_base),
        Number(fx.subtotal),
        Number(fx.tax_amount),
        Number(fx.total)
      ),
    });
  }

  if (String(updates.status ?? '') !== 'voided' && (monetaryChanged || !!items)) {
    const finalTotal = Number(updates.total ?? (invoice as { total?: number }).total ?? 0);
    const finalPaid = Number(
      updates.amount_paid ?? (invoice as { amount_paid?: number }).amount_paid ?? 0
    );
    updates.balance_due = computeInvoiceBalanceDue(finalTotal, finalPaid);
  }

  if (Object.keys(updates).length === 0 && !items && !(useSchedule && schedule)) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }

  const shouldSyncCustomerSnapshot =
    updates.metadata !== undefined ||
    updates.customer_name !== undefined ||
    updates.customer_email !== undefined ||
    updates.customer_id !== undefined ||
    body.client_billing !== undefined;

  if (shouldSyncCustomerSnapshot && Object.keys(updates).length > 0) {
    let metaBase = updates.metadata as Record<string, unknown> | undefined;
    if (metaBase === undefined) {
      const { data: curInv } = await supabase.from('invoices').select('metadata').eq('id', id).single();
      metaBase = (curInv?.metadata as Record<string, unknown>) ?? {};
    }
    const nm = String(updates.customer_name ?? (invoice as any).customer_name ?? '').trim();
    const em =
      updates.customer_email !== undefined
        ? (updates.customer_email as string | null)
        : ((invoice as any).customer_email as string | null);
    updates.metadata = withSyncedPublicCustomerSnapshot(metaBase, nm, em);
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (items && items.length >= 0) {
    await supabase.from('invoice_items').delete().eq('invoice_id', id);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const amount = Number(it.quantity ?? 0) * Number(it.unit_price ?? 0);
      await supabase.from('invoice_items').insert({
        invoice_id: id,
        name: it.name ?? 'Item',
        description: it.description ?? null,
        quantity: Number(it.quantity) ?? 1,
        unit_price: Number(it.unit_price) ?? 0,
        amount,
        unit_label: normalizeInvoiceUnitLabel(
          (it as { unit_label?: string | null }).unit_label ?? 'item'
        ),
        sort_order: i,
        tax_percent: it.tax_percent != null ? Number(it.tax_percent) : 0,
        assignee: normalizeInvoiceAssignee((it as { assignee?: unknown }).assignee),
      });
    }
  }

  if (useSchedule && schedule) {
    // Keep paid rows stable; allow editing pending rows. Upsert by id, delete removed pending rows.
    const { data: existingRows } = await supabase
      .from('invoice_payment_schedule_items')
      .select('id, status, amount, due_date, description')
      .eq('invoice_id', id);

    const existingById = new Map<string, any>((existingRows ?? []).map((r: any) => [r.id, r]));
    const scheduleProcessed = (schedule as Array<Record<string, unknown>>).map((raw) => {
      const r = { ...raw };
      const idStr = r.id != null ? String(r.id).trim() : '';
      if (idStr && !existingById.has(idStr)) {
        delete r.id;
      }
      return r;
    });
    const incomingIds = new Set<string>();
    for (const r of scheduleProcessed) {
      if (r.id) incomingIds.add(String(r.id));
      const existing = r.id ? existingById.get(String(r.id)) : null;
      if (existing && existing.status === 'paid') {
        // For paid rows, reject modifications.
        const same =
          Number(existing.amount) === Number(r.amount) &&
          String(existing.due_date) === String(r.due_date) &&
          String(existing.description) === String(r.description) &&
          String(r.status ?? existing.status) === 'paid';
        if (!same) {
          return NextResponse.json({ error: 'Paid schedule rows cannot be modified.' }, { status: 400 });
        }
        continue;
      }
      if (r.id && existing) {
        await supabase
          .from('invoice_payment_schedule_items')
          .update({
            description: r.description,
            amount: Number(r.amount),
            due_date: r.due_date,
            status: r.status ?? 'pending',
          })
          .eq('id', r.id)
          .eq('invoice_id', id);
      } else {
        await supabase.from('invoice_payment_schedule_items').insert({
          invoice_id: id,
          description: r.description,
          amount: Number(r.amount),
          due_date: r.due_date,
          status: r.status ?? 'pending',
        });
      }
    }
    // Delete pending rows removed by client
    for (const r of existingRows ?? []) {
      if (r.status === 'pending' && !incomingIds.has(String(r.id))) {
        await supabase.from('invoice_payment_schedule_items').delete().eq('id', r.id).eq('invoice_id', id);
      }
    }
  }

  const { data: updated, error: err } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), invoice_payment_schedule_items(*)')
    .eq('id', id)
    .single();

  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const invoiceNumberForAudit = String(
    (updated as any)?.invoice_number || (invoice as any)?.invoice_number || id
  ).trim();

  let loggedAutoReminderSpecific = false;
  if (reminderTouchedEarly) {
    const { data: custBefore } = await supabase
      .from('customers')
      .select('reminder_settings')
      .eq('id', String((invoice as { customer_id?: string | null }).customer_id ?? '').trim())
      .maybeSingle();
    const { data: custAfter } = await supabase
      .from('customers')
      .select('reminder_settings')
      .eq('id', String((updated as { customer_id?: string | null }).customer_id ?? '').trim())
      .maybeSingle();
    const nowTs = new Date();
    const fpBefore = reminderConfigFingerprint(
      (invoice as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false,
      custBefore?.reminder_settings ?? null,
      (invoice as { reminder_settings?: unknown }).reminder_settings
    );
    const fpAfter = reminderConfigFingerprint(
      (updated as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false,
      custAfter?.reminder_settings ?? null,
      (updated as { reminder_settings?: unknown }).reminder_settings
    );
    const beforeEff = resolveEffectiveReminderConfig(
      (invoice as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false,
      custBefore?.reminder_settings ?? null,
      (invoice as { reminder_settings?: unknown }).reminder_settings
    );
    const afterEff = resolveEffectiveReminderConfig(
      (updated as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false,
      custAfter?.reminder_settings ?? null,
      (updated as { reminder_settings?: unknown }).reminder_settings
    );
    const beforeM = effectiveReminderMeaningful(beforeEff, nowTs);
    const afterM = effectiveReminderMeaningful(afterEff, nowTs);
    let action: AuditAction | null = null;
    if (!beforeM && afterM) action = 'auto_reminders_enabled';
    else if (beforeM && !afterM) action = 'auto_reminders_disabled';
    else if (beforeM && afterM && fpBefore !== fpAfter) action = 'auto_reminders_updated';
    if (action) {
      await logAuditEvent(supabase, {
        businessId: String((business as { id: string }).id),
        entityType: 'invoice',
        entityId: String(id),
        action,
        performedByUserId: user.id,
        performedByName: actorName,
        metadata: invAuditMeta({ invoice_number: invoiceNumberForAudit }),
      });
      loggedAutoReminderSpecific = true;
    }
  }

  const nextAmountPaid = Number((updated as any)?.amount_paid ?? 0);
  const updatedDerivedStatus = deriveInvoiceStatus({
    status: String((updated as any)?.status ?? ''),
    total: Number((updated as any)?.total ?? 0),
    amount_paid: nextAmountPaid,
    balance_due:
      (updated as any)?.balance_due != null
        ? Number((updated as any).balance_due)
        : Math.max(0, Number((updated as any)?.total ?? 0) - nextAmountPaid),
    total_refunded: Number((updated as any)?.total_refunded ?? 0),
  });
  const afterSnapshot = {
    total: Number((updated as any)?.total ?? 0),
    due_date: String((updated as any)?.due_date ?? ''),
    currency: String((updated as any)?.currency ?? ''),
    customer_id: String((updated as any)?.customer_id ?? ''),
    customer_name: String((updated as any)?.customer_name ?? ''),
    status: updatedDerivedStatus,
  };
  const changedFields = getChangedInvoiceFields(beforeSnapshot, afterSnapshot);
  if (changedFields.length > 0) {
    const invoiceNumber = String((updated as any)?.invoice_number || (invoice as any)?.invoice_number || id).trim();
    const humanField =
      changedFields.includes('total')
        ? 'amount'
        : changedFields.includes('due_date')
          ? 'due date'
          : changedFields.includes('currency')
            ? 'currency'
            : changedFields.includes('customer_id') || changedFields.includes('customer_name')
              ? 'customer'
              : 'status';
    await createActivity(supabase, {
      business_id: String((business as any).id),
      eventType: 'invoice_updated',
      title: `Invoice ${invoiceNumber} updated`,
      description: `Invoice ${invoiceNumber} updated (${humanField} changed)`,
      entityType: 'invoice',
      entityId: String(id),
      amount: Number((updated as any)?.total ?? 0),
      currencyCode: String((updated as any)?.currency ?? (business as any)?.currency ?? 'USD'),
      metadata: { changed_fields: changedFields, source: mutationSource },
    });
  }
  if (beforeSnapshot.status !== 'overdue' && afterSnapshot.status === 'overdue') {
    const invoiceNumber = String((updated as any)?.invoice_number || (invoice as any)?.invoice_number || id).trim();
    await createActivity(supabase, {
      business_id: String((business as any).id),
      eventType: 'invoice_overdue',
      title: `Invoice ${invoiceNumber} is overdue`,
      description: `Invoice ${invoiceNumber} moved to overdue status`,
      entityType: 'invoice',
      entityId: String(id),
      severity: 'warning',
      amount: Number((updated as any)?.balance_due ?? 0),
      currencyCode: String((updated as any)?.currency ?? (business as any)?.currency ?? 'USD'),
    });
    await notifyBusinessEvent(supabase, {
      businessId: String((business as any).id),
      eventType: 'invoice_overdue',
      title: `Invoice ${invoiceNumber} is overdue`,
      message: `Invoice ${invoiceNumber} is overdue and requires follow-up.`,
      entityType: 'invoice',
      entityId: String(id),
      severity: 'warning',
      actionLabel: 'Review invoice',
      actionTarget: `/dashboard/invoices/${String(id)}`,
      groupKey: `invoice_overdue:${String(id)}`,
      email: {
        to: String((updated as any)?.customer_email ?? (invoice as any)?.customer_email ?? '').trim() || null,
        subject: buildInvoiceEmailSubject({
          state: 'overdue',
          invoiceNumber,
          companyName: String((business as any)?.name ?? ''),
          dueDate: String((updated as any)?.due_date ?? (invoice as any)?.due_date ?? ''),
        }),
        textBody: `Invoice ${invoiceNumber} is overdue. Please review and settle the outstanding balance.`,
        templateEnvKey: 'POSTMARK_TEMPLATE_OVERDUE_REMINDER',
        templateModel: {
          invoiceNumber,
          companyName: String((business as any)?.name ?? ''),
          customerName: String((updated as any)?.customer_name ?? (invoice as any)?.customer_name ?? ''),
          dueDate: String((updated as any)?.due_date ?? (invoice as any)?.due_date ?? ''),
          balanceDue: Number((updated as any)?.balance_due ?? 0),
        },
        tag: 'invoice_overdue',
      },
    });
  }
  const receivedDelta = Math.max(0, nextAmountPaid - prevAmountPaid);
  if (receivedDelta > 0.0001) {
    const currencyCode =
      String((updated as any)?.currency || (business as any)?.currency || 'USD').toUpperCase();
    const invoiceNumber = String((updated as any)?.invoice_number || id).trim();
    const nowIso = new Date().toISOString();
    const remainingBalance =
      (updated as any)?.balance_due != null
        ? Number((updated as any).balance_due)
        : Math.max(0, Number((updated as any)?.total ?? 0) - nextAmountPaid);
    await createPaymentActivity(supabase, {
      business_id: String((business as any).id),
      invoice_id: String(id),
      invoice_number: invoiceNumber,
      amount: receivedDelta,
      currency: currencyCode,
      remaining_balance: remainingBalance,
      timestamp: nowIso,
      source_payment_id: `manual:${String(id)}:${nowIso}:${Math.round(receivedDelta * 100)}`,
    });
    await logAuditEvent(supabase, {
      businessId: String((business as any).id),
      entityType: 'invoice',
      entityId: String(id),
      action: 'payment_recorded',
      performedByUserId: user.id,
      performedByName: actorName,
      metadata: {
        invoice_number: invoiceNumber,
        amount: receivedDelta,
        currency: currencyCode,
        source: 'invoice_patch',
      },
    });
    if (updatedDerivedStatus === 'paid') {
      await logAuditEvent(supabase, {
        businessId: String((business as any).id),
        entityType: 'invoice',
        entityId: String(id),
        action: 'marked_paid',
        performedByUserId: user.id,
        performedByName: actorName,
        metadata: invAuditMeta({ invoice_number: invoiceNumber }),
      });
    } else if (updatedDerivedStatus === 'partially_paid') {
      await logAuditEvent(supabase, {
        businessId: String((business as any).id),
        entityType: 'invoice',
        entityId: String(id),
        action: 'partially_paid',
        performedByUserId: user.id,
        performedByName: actorName,
        metadata: invAuditMeta({ invoice_number: invoiceNumber }),
      });
    }
  }

  const wasVoidedTransition = String((updated as any)?.status) === 'voided' && rawDbStatus !== 'voided';
  if (wasVoidedTransition) {
    await logAuditEvent(supabase, {
      businessId: String((business as any).id),
      entityType: 'invoice',
      entityId: String(id),
      action: 'voided',
      performedByUserId: user.id,
      performedByName: actorName,
      metadata: invAuditMeta({ invoice_number: invoiceNumberForAudit }),
    });
  } else {
    const scheduleTouched = canMutateSchedule && (body.use_payment_schedule !== undefined || schedule);
    const prevUseSchedule = Boolean((invoice as { use_payment_schedule?: boolean }).use_payment_schedule);

    if (scheduleTouched) {
      if (useSchedule && schedule && (schedule as unknown[]).length > 0) {
        const planAction = !prevUseSchedule ? 'payment_plan_created' : 'payment_plan_updated';
        await logAuditEvent(supabase, {
          businessId: String((business as any).id),
          entityType: 'invoice',
          entityId: String(id),
          action: planAction,
          performedByUserId: user.id,
          performedByName: actorName,
          metadata: invAuditMeta({ invoice_number: invoiceNumberForAudit }),
        });
      } else if (!useSchedule && prevUseSchedule) {
        await logAuditEvent(supabase, {
          businessId: String((business as any).id),
          entityType: 'invoice',
          entityId: String(id),
          action: 'payment_plan_updated',
          performedByUserId: user.id,
          performedByName: actorName,
          metadata: invAuditMeta({ invoice_number: invoiceNumberForAudit, change: 'removed' }),
        });
      }
    }

    const hadEdit =
      items !== null ||
      changedFields.length > 0 ||
      (reminderTouchedEarly && !loggedAutoReminderSpecific) ||
      (canEditFully(status) && body.client_billing !== undefined);
    if (hadEdit) {
      await logAuditEvent(supabase, {
        businessId: String((business as any).id),
        entityType: 'invoice',
        entityId: String(id),
        action: 'edited',
        performedByUserId: user.id,
        performedByName: actorName,
        metadata: invAuditMeta({ invoice_number: invoiceNumberForAudit, changed_fields: changedFields }),
      });
    }
  }

  const invTotalOut = Number((updated as any)?.total ?? 0);
  const paymentScheduleOut = buildPaymentScheduleResponse(
    (updated as any)?.invoice_payment_schedule_items,
    invTotalOut
  );

  return NextResponse.json({
    ...(updated as object),
    paymentSchedule: paymentScheduleOut,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, business_id, status, invoice_number, customer_name, total, currency')
    .eq('id', id)
    .single();

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', invoice.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';
  const rawStatus = String(invoice.status ?? '').toLowerCase();
  if (rawStatus !== 'draft') {
    const guidance =
      rawStatus === 'paid'
        ? 'Deletion is blocked for paid invoices. Use refund or cancel/void flows instead.'
        : rawStatus === 'partially_paid'
          ? 'Deletion is blocked for partially paid invoices. Use void/cancel, and issue a refund when applicable.'
          : rawStatus === 'sent'
            ? 'Deletion is blocked for sent invoices. Use void/cancel instead.'
            : 'Only draft invoices can be deleted. Use void/cancel/refund actions instead.';
    return NextResponse.json(
      { error: guidance },
      { status: 403 }
    );
  }

  const { error: err } = await supabase.from('invoices').delete().eq('id', id);
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  await createActivity(supabase, {
    business_id: String((business as any).id),
    eventType: 'invoice_deleted',
    title: `Invoice ${String((invoice as any).invoice_number || id)} deleted`,
    description: `Draft invoice for ${String((invoice as any).customer_name || 'customer')} was deleted`,
    entityType: 'invoice',
    entityId: String(id),
    amount: Number((invoice as any).total ?? 0),
    currencyCode: String((invoice as any).currency ?? 'USD'),
  });
  await logAuditEvent(supabase, {
    businessId: String((business as any).id),
    entityType: 'invoice',
    entityId: String(id),
    action: 'deleted',
    performedByUserId: user.id,
    performedByName: actorName,
    metadata: {
      invoice_number: String((invoice as any).invoice_number || id).trim(),
      source: 'manual',
    },
  });
  return NextResponse.json({ ok: true });
}
