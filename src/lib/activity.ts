import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityType } from '@/lib/database.types';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { notifyBusinessEvent } from '@/services/notifications';

export type ActivitySeverity = 'info' | 'success' | 'warning' | 'danger';

export type ActivityEntityType =
  | 'invoice'
  | 'customer'
  | 'payment'
  | 'expense'
  | 'quote'
  | 'system';

export type ActivityEventType = ActivityType;

export type ActivityInput = {
  business_id: string;
  eventType: ActivityEventType;
  title: string;
  description?: string | null;
  entityType?: ActivityEntityType | null;
  entityId?: string | null;
  severity?: ActivitySeverity;
  amount?: number;
  currencyCode?: string;
  metadata?: Record<string, unknown> | null;
};

function isActivityEventsMissingError(err: unknown): boolean {
  const maybe = err as { message?: string; details?: string; hint?: string; code?: string };
  const msg = String(maybe?.message ?? '').toLowerCase();
  const details = String(maybe?.details ?? '').toLowerCase();
  const hint = String(maybe?.hint ?? '').toLowerCase();
  const combined = `${msg} ${details} ${hint}`.trim();
  return (
    combined.includes("could not find the table 'public.activity_events'") ||
    combined.includes('could not find the table') && combined.includes('activity_events') ||
    combined.includes('relation "public.activity_events" does not exist') ||
    combined.includes('relation "activity_events" does not exist') ||
    (combined.includes('schema cache') && combined.includes('activity_events'))
  );
}

function defaultSeverityForEvent(type: ActivityEventType): ActivitySeverity {
  if (
    type === 'payment_received' ||
    type === 'invoice_paid' ||
    type === 'payment_full' ||
    type === 'payment_partial'
  ) {
    return 'success';
  }
  if (
    type === 'invoice_overdue' ||
    type === 'high_expense_created' ||
    type === 'quote_rejected' ||
    type === 'quote_expired'
  ) {
    return 'warning';
  }
  return 'info';
}

export function getChangedInvoiceFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  const add = (name: string, prev: unknown, next: unknown) => {
    if (String(prev ?? '') !== String(next ?? '')) changed.push(name);
  };
  add('total', before.total, after.total);
  add('due_date', before.due_date, after.due_date);
  add('currency', before.currency, after.currency);
  add('customer_id', before.customer_id, after.customer_id);
  add('customer_name', before.customer_name, after.customer_name);
  add('status', before.status, after.status);
  return changed;
}

export function getChangedCustomerFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  const fields = [
    'name',
    'email',
    'phone',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'postal_code',
    'country',
    'company',
  ];
  for (const f of fields) {
    if (String(before[f] ?? '') !== String(after[f] ?? '')) changed.push(f);
  }
  return changed;
}

export function getChangedExpenseFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  const fields = [
    'amount',
    'category',
    'description',
    'expense_date',
    'attachment_url',
  ];
  for (const f of fields) {
    if (String(before[f] ?? '') !== String(after[f] ?? '')) changed.push(f);
  }
  return changed;
}

export async function createActivity(
  supabase: SupabaseClient,
  input: ActivityInput
) {
  const eventType = input.eventType;
  const severity = input.severity ?? defaultSeverityForEvent(eventType);
  const amount =
    typeof input.amount === 'number' && Number.isFinite(input.amount)
      ? input.amount
      : undefined;
  const currencyCode =
    input.currencyCode && String(input.currencyCode).trim()
      ? String(input.currencyCode).toUpperCase()
      : undefined;
  await logActivity(supabase, {
    business_id: input.business_id,
    type: eventType,
    title: input.title,
    description: input.description ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: {
      severity,
      event_type: eventType,
      ...(amount != null ? { amount } : {}),
      ...(currencyCode ? { currencyCode } : {}),
      ...(input.metadata ?? {}),
    },
  });
}

export async function logActivity(
  supabase: SupabaseClient,
  payload: {
    business_id: string;
    type: ActivityType;
    title: string;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
    entity_type?: string | null;
    entity_id?: string | null;
  }
) {
  const { error } = await supabase.from('activity_events').insert({
    business_id: payload.business_id,
    type: payload.type,
    title: payload.title,
    description: payload.description ?? null,
    metadata: payload.metadata ?? null,
    entity_type: payload.entity_type ?? null,
    entity_id: payload.entity_id ?? null,
  });
  if (error) {
    if (isActivityEventsMissingError(error)) {
      console.warn('Activity table missing; skipping activity insert.');
      return;
    }
    throw new Error(`Failed to write activity event: ${error.message}`);
  }
}

export async function createPaymentActivity(
  supabase: SupabaseClient,
  payload: {
    business_id: string;
    invoice_id: string;
    invoice_number: string;
    amount: number;
    currency: string;
    remaining_balance: number;
    timestamp?: string;
    source_payment_id?: string;
  }
) {
  const ts = payload.timestamp ?? new Date().toISOString();
  const isFull = Number(payload.remaining_balance ?? 0) <= 0.0001;
  const eventType: ActivityType = isFull ? 'invoice_paid' : 'payment_received';
  const eventKind = isFull ? 'payment_full' : 'payment_partial';
  const title = isFull ? 'Invoice paid' : 'Payment received';
  const description = isFull
    ? `Invoice ${payload.invoice_number} has been fully paid`
    : `Partial payment of ${formatCurrencyAmount(payload.amount, payload.currency)} received for Invoice ${payload.invoice_number}`;

  const newActivity = {
    id: `${payload.invoice_id}:${ts}:${Math.round(Number(payload.amount || 0) * 100)}`,
    eventType,
    eventKind,
    title,
    description,
    timestamp: ts,
    invoiceId: payload.invoice_id,
    invoiceNumber: payload.invoice_number,
    amount: Number(payload.amount || 0),
    currency: payload.currency,
    source_payment_id: payload.source_payment_id ?? null,
  };

  if (payload.source_payment_id) {
    const { data: existing, error: existingErr } = await supabase
      .from('activity_events')
      .select('id')
      .eq('business_id', payload.business_id)
      .eq('type', eventType)
      .eq('entity_type', 'invoice')
      .eq('entity_id', payload.invoice_id)
      .contains('metadata', { source_payment_id: payload.source_payment_id })
      .limit(1);
    if (existingErr) {
      if (isActivityEventsMissingError(existingErr)) {
        console.warn('Activity table missing; skipping payment duplicate check.');
      } else {
        throw new Error(`Failed to check existing payment activity: ${existingErr.message}`);
      }
    }
    if (existingErr && isActivityEventsMissingError(existingErr)) {
      // Continue to createActivity -> logActivity, which will no-op while table is missing.
    } else if (existing && existing.length > 0) {
      return;
    }
  }

  await createActivity(supabase, {
    business_id: payload.business_id,
    eventType,
    title,
    description,
    entityType: 'invoice',
    entityId: payload.invoice_id,
    severity: isFull ? 'success' : 'success',
    amount: Number(payload.amount || 0),
    currencyCode: payload.currency,
    metadata: {
      event_kind: eventKind,
      invoice_id: payload.invoice_id,
      invoice_number: payload.invoice_number,
      remaining_balance: Number(payload.remaining_balance || 0),
      timestamp: ts,
      source_payment_id: payload.source_payment_id ?? null,
    },
  });
  await createActivity(supabase, {
    business_id: payload.business_id,
    eventType: isFull ? 'payment_full' : 'payment_partial',
    title: isFull ? 'Payment completed' : 'Partial payment received',
    description,
    entityType: 'invoice',
    entityId: payload.invoice_id,
    severity: 'success',
    amount: Number(payload.amount || 0),
    currencyCode: payload.currency,
    metadata: {
      invoice_id: payload.invoice_id,
      invoice_number: payload.invoice_number,
      remaining_balance: Number(payload.remaining_balance || 0),
      timestamp: ts,
      source_payment_id: payload.source_payment_id ?? null,
    },
  });

  const { data: invoiceRow } = await supabase
    .from('invoices')
    .select('id, customer_email, customer_name, currency')
    .eq('id', payload.invoice_id)
    .maybeSingle();

  await notifyBusinessEvent(supabase, {
    businessId: payload.business_id,
    eventType: isFull ? 'invoice_paid' : 'payment_received',
    title: isFull ? `Invoice ${payload.invoice_number} paid` : `Payment received for ${payload.invoice_number}`,
    message: isFull
      ? `Invoice ${payload.invoice_number} is fully paid.`
      : `Payment received for ${payload.invoice_number}. Remaining balance: ${formatCurrencyAmount(Number(payload.remaining_balance || 0), payload.currency)}.`,
    entityType: 'invoice',
    entityId: payload.invoice_id,
    severity: 'success',
    actionLabel: 'View invoice',
    actionTarget: `/dashboard/invoices/${payload.invoice_id}`,
    groupKey: `payment_received:${payload.invoice_id}:${Math.round(Number(payload.amount || 0) * 100)}:${ts}`,
    email: {
      to: String((invoiceRow as any)?.customer_email ?? '').trim() || null,
      subject: `Payment received for ${payload.invoice_number}`,
      textBody: `A payment has been received for invoice ${payload.invoice_number}.`,
      templateEnvKey: 'POSTMARK_TEMPLATE_PAYMENT_RECEIVED',
      templateModel: {
        invoiceNumber: payload.invoice_number,
        customerName: String((invoiceRow as any)?.customer_name ?? ''),
        amount: Number(payload.amount || 0),
        currency: String((invoiceRow as any)?.currency ?? payload.currency ?? 'USD'),
        remainingBalance: Number(payload.remaining_balance || 0),
      },
      tag: 'payment_received',
    },
    internalEmail: {
      subject: `Payment received: ${payload.invoice_number}`,
      textBody: `A payment of ${formatCurrencyAmount(Number(payload.amount || 0), payload.currency)} was recorded for ${payload.invoice_number}.`,
      tag: 'payment_received_internal',
    },
  });
  console.log('Payment recorded → Activity created', newActivity);
}
