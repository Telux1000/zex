import type { SupabaseClient } from '@supabase/supabase-js';
import { createActivity } from '@/lib/activity';
import type { InvoiceMutationSource } from '@/lib/audit-log';
import { logAuditEvent } from '@/lib/audit-log';
import { notifyBusinessEvent } from '@/services/notifications';

/** Activity + audit + notification after a draft invoice row (and lines) is persisted. */
export async function logInvoiceDraftCreated(params: {
  supabase: SupabaseClient;
  businessId: string;
  performedByUserId: string;
  performedByName: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  total: number;
  currencyCode: string;
  source: InvoiceMutationSource;
  hasPaymentSchedule: boolean;
}): Promise<void> {
  const {
    supabase,
    businessId,
    performedByUserId,
    performedByName,
    invoiceId,
    invoiceNumber,
    customerName,
    total,
    currencyCode,
    source,
    hasPaymentSchedule,
  } = params;

  await createActivity(supabase, {
    business_id: businessId,
    eventType: 'invoice_created',
    title: `Invoice ${invoiceNumber} created`,
    description: `Draft for ${customerName}`,
    entityType: 'invoice',
    entityId: invoiceId,
    amount: total,
    currencyCode,
    metadata: {
      invoice_number: invoiceNumber,
      customer_name: customerName || null,
      source,
    },
  });

  await logAuditEvent(supabase, {
    businessId,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'created',
    performedByUserId,
    performedByName,
    metadata: {
      invoice_number: invoiceNumber,
      customer_name: customerName || null,
      source,
    },
  });

  if (hasPaymentSchedule) {
    await logAuditEvent(supabase, {
      businessId,
      entityType: 'invoice',
      entityId: invoiceId,
      action: 'payment_plan_created',
      performedByUserId,
      performedByName,
      metadata: { invoice_number: invoiceNumber, source },
    });
  }

  await notifyBusinessEvent(supabase, {
    businessId,
    eventType: 'invoice_created',
    title: `Invoice ${invoiceNumber} created`,
    message: `Draft invoice ${invoiceNumber} created for ${customerName}.`,
    entityType: 'invoice',
    entityId: invoiceId,
    severity: 'info',
    actionLabel: 'View invoice',
    actionTarget: `/dashboard/invoices/${invoiceId}`,
    groupKey: `invoice_created:${invoiceId}`,
  });
}
