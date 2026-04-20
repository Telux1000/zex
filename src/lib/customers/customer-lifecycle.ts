import type { SupabaseClient } from '@supabase/supabase-js';
import { createActivity } from '@/lib/activity';
import { logAuditEvent } from '@/lib/audit-log';
import { getStripeOrNull } from '@/lib/stripe';

export type HardDeleteDecision = {
  allowed: boolean;
  reason: string | null;
  blockers: string[];
};

export type FinancialHistorySnapshot = {
  invoiceCount: number;
  paidInvoiceCount: number;
  paymentCount: number;
  subscriptionHistoryCount: number;
  activeSubscriptionCount: number;
  creditNoteCount: number;
  customerBalanceRecordCount: number;
  disputeRefundTaxRecordCount: number;
  financialAuditLogCount: number;
  linkedStripeBillingObjectCount: number;
};

type LifecycleCustomerRow = {
  id: string;
  business_id: string;
  stripe_customer_id: string | null;
  account_number?: string | null;
  name?: string | null;
  company?: string | null;
};

export function hasFinancialHistory(snapshot: FinancialHistorySnapshot): boolean {
  return (
    snapshot.invoiceCount > 0 ||
    snapshot.paidInvoiceCount > 0 ||
    snapshot.paymentCount > 0 ||
    snapshot.subscriptionHistoryCount > 0 ||
    snapshot.creditNoteCount > 0 ||
    snapshot.customerBalanceRecordCount > 0 ||
    snapshot.disputeRefundTaxRecordCount > 0 ||
    snapshot.financialAuditLogCount > 0 ||
    snapshot.linkedStripeBillingObjectCount > 0
  );
}

function blockersFromSnapshot(snapshot: FinancialHistorySnapshot): string[] {
  const blockers: string[] = [];
  if (snapshot.invoiceCount > 0) blockers.push('invoice_history');
  if (snapshot.paidInvoiceCount > 0) blockers.push('paid_invoice_history');
  if (snapshot.paymentCount > 0) blockers.push('payment_history');
  if (snapshot.subscriptionHistoryCount > 0) blockers.push('subscription_history');
  if (snapshot.activeSubscriptionCount > 0) blockers.push('active_subscription');
  if (snapshot.creditNoteCount > 0) blockers.push('credit_note_history');
  if (snapshot.customerBalanceRecordCount > 0) blockers.push('customer_balance_or_credits');
  if (snapshot.disputeRefundTaxRecordCount > 0) blockers.push('dispute_refund_tax_records');
  if (snapshot.financialAuditLogCount > 0) blockers.push('financial_audit_history');
  if (snapshot.linkedStripeBillingObjectCount > 0) blockers.push('linked_stripe_billing_records');
  return blockers;
}

function decisionFromSnapshot(snapshot: FinancialHistorySnapshot): HardDeleteDecision {
  const blockers = blockersFromSnapshot(snapshot);
  if (blockers.length > 0) {
    return {
      allowed: false,
      reason:
        'Customer cannot be permanently deleted because billing records exist. Archive or anonymize this customer instead.',
      blockers,
    };
  }
  return { allowed: true, reason: null, blockers: [] };
}

export function evaluateHardDeleteDecision(snapshot: FinancialHistorySnapshot): HardDeleteDecision {
  return decisionFromSnapshot(snapshot);
}

export function buildAnonymizedCustomerPatch(args: {
  alias: string;
  actorUserId: string;
  nowIso: string;
}) {
  return {
    name: args.alias,
    email: null,
    phone: null,
    company: args.alias,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    postal_code: null,
    country: null,
    country_code: null,
    notes: '[REDACTED]',
    anonymized_at: args.nowIso,
    anonymized_by: args.actorUserId,
    is_active: false,
    archived_at: args.nowIso,
    archived_by: args.actorUserId,
  };
}

export function canRestoreCustomerState(anonymizedAt: string | null | undefined): boolean {
  return !String(anonymizedAt ?? '').trim();
}

async function fetchRecurringSubscriptionCounts(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string
) {
  const { data: rows } = await supabase
    .from('recurring_invoice_rules')
    .select('id, status, template_snapshot')
    .eq('business_id', businessId);
  const related = (rows ?? []).filter((row) => {
    const snapshot = row.template_snapshot as { customer_id?: string | null } | null;
    return String(snapshot?.customer_id ?? '') === customerId;
  });
  const activeCount = related.filter((row) => String(row.status).toLowerCase() === 'active').length;
  return { historyCount: related.length, activeCount };
}

async function fetchStripeBillingObjectCount(stripeCustomerId: string | null): Promise<number> {
  if (!stripeCustomerId) return 0;
  const stripe = getStripeOrNull();
  if (!stripe) return 0;
  try {
    const [invoiceList, subList, paymentIntentList, chargeList, creditNotes] = await Promise.all([
      stripe.invoices.list({ customer: stripeCustomerId, limit: 1 }),
      stripe.subscriptions.list({ customer: stripeCustomerId, limit: 1, status: 'all' }),
      stripe.paymentIntents.list({ customer: stripeCustomerId, limit: 1 }),
      stripe.charges.list({ customer: stripeCustomerId, limit: 1 }),
      stripe.creditNotes.list({ customer: stripeCustomerId, limit: 1 }),
    ]);
    return (
      invoiceList.data.length +
      subList.data.length +
      paymentIntentList.data.length +
      chargeList.data.length +
      creditNotes.data.length
    );
  } catch {
    return 1;
  }
}

async function detachStripePaymentMethods(stripeCustomerId: string | null): Promise<void> {
  if (!stripeCustomerId) return;
  const stripe = getStripeOrNull();
  if (!stripe) return;
  try {
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: undefined },
      default_source: undefined,
    });
  } catch {
    // best effort
  }
}

async function fetchLifecycleCustomerRow(
  supabase: SupabaseClient,
  customerId: string
): Promise<LifecycleCustomerRow | null> {
  const primary = await supabase
    .from('customers')
    .select('id, business_id, stripe_customer_id, account_number, name, company')
    .eq('id', customerId)
    .maybeSingle();

  if (!primary.error) {
    const row = primary.data as LifecycleCustomerRow | null;
    return row ?? null;
  }

  const fallback = await supabase
    .from('customers')
    .select('id, business_id, account_number, name, company')
    .eq('id', customerId)
    .maybeSingle();
  if (fallback.error) return null;
  const row = fallback.data as Omit<LifecycleCustomerRow, 'stripe_customer_id'> | null;
  if (!row) return null;
  return { ...row, stripe_customer_id: null };
}

export async function canHardDeleteCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<HardDeleteDecision> {
  const customer = await fetchLifecycleCustomerRow(supabase, customerId);
  if (!customer) {
    return { allowed: false, reason: 'Customer not found', blockers: ['not_found'] };
  }

  const [{ count: invoiceCount }, { count: paidInvoiceCount }] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_id', customerId),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('status', 'paid'),
  ]);

  const { data: invoiceRows } = await supabase.from('invoices').select('id, total_refunded').eq('customer_id', customerId);
  const invoiceIds = (invoiceRows ?? []).map((row) => String(row.id));

  let paymentCount = 0;
  if (invoiceIds.length > 0) {
    const { count } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('invoice_id', invoiceIds);
    paymentCount = count ?? 0;
  }

  const { historyCount: subscriptionHistoryCount, activeCount: activeSubscriptionCount } =
    await fetchRecurringSubscriptionCounts(supabase, String(customer.business_id), customerId);

  const creditNoteCount = (invoiceRows ?? []).filter((r) => Number((r as { total_refunded?: number | null }).total_refunded ?? 0) > 0).length;
  const customerBalanceRecordCount = creditNoteCount;

  const { count: disputeRefundTaxRecordCount } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', String(customer.business_id))
    .or(
      [
        'metadata->>dispute_id.not.is.null',
        'metadata->>refund_id.not.is.null',
        'metadata->>tax_record_id.not.is.null',
        'metadata->>tax_amount.not.is.null',
      ].join(',')
    );

  const { count: financialAuditLogCount } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', String(customer.business_id))
    .eq('entity_type', 'customer')
    .eq('entity_id', customerId)
    .or('metadata->>financial_history.eq.true,metadata->>is_financial_history.eq.true');

  const linkedStripeBillingObjectCount = await fetchStripeBillingObjectCount(
    String((customer as { stripe_customer_id?: string | null }).stripe_customer_id ?? '') || null
  );

  return decisionFromSnapshot({
    invoiceCount: invoiceCount ?? 0,
    paidInvoiceCount: paidInvoiceCount ?? 0,
    paymentCount,
    subscriptionHistoryCount,
    activeSubscriptionCount,
    creditNoteCount,
    customerBalanceRecordCount,
    disputeRefundTaxRecordCount: disputeRefundTaxRecordCount ?? 0,
    financialAuditLogCount: financialAuditLogCount ?? 0,
    linkedStripeBillingObjectCount,
  });
}

export async function archiveCustomer(args: {
  supabase: SupabaseClient;
  customerId: string;
  actorUserId: string;
  actorName: string;
  reason?: string | null;
}) {
  const { supabase, customerId, actorUserId, actorName, reason } = args;
  const now = new Date().toISOString();
  const customer = await fetchLifecycleCustomerRow(supabase, customerId);
  if (!customer) throw new Error('Customer not found');

  const hardDeleteDecision = await canHardDeleteCustomer(supabase, customerId);
  if (hardDeleteDecision.blockers.includes('active_subscription')) {
    throw new Error('Active subscriptions must be cancelled before archiving this customer.');
  }

  await detachStripePaymentMethods(String(customer.stripe_customer_id ?? '') || null);

  const { error } = await supabase
    .from('customers')
    .update({
      archived_at: now,
      archived_by: actorUserId,
      archive_reason: reason?.trim() || null,
      is_active: false,
      deletion_locked_reason: 'billing_history',
    })
    .eq('id', customerId);
  if (error) {
    const msg = String(error.message ?? '');
    if (msg.includes('archived_at') || msg.includes('anonymized_at') || msg.includes('is_active')) {
      throw new Error(
        'Customer lifecycle columns are not available yet. Please run migration 089_customers_archive_anonymize_controls.sql and retry.'
      );
    }
    throw new Error(msg || 'Failed to archive customer');
  }

  try {
    await createActivity(supabase, {
      business_id: String(customer.business_id),
      eventType: 'customer_updated',
      title: 'Customer archived',
      description: 'Customer was archived and removed from active lists',
      entityType: 'customer',
      entityId: customerId,
    });
    await logAuditEvent(supabase, {
      businessId: String(customer.business_id),
      entityType: 'customer',
      entityId: customerId,
      action: 'archived',
      performedByUserId: actorUserId,
      performedByName: actorName,
      metadata: {
        reason: reason ?? null,
        archive_reason: reason ?? null,
        stripe_customer_id: customer.stripe_customer_id ?? null,
        financial_history: true,
      },
    });
  } catch {
    // Archiving already succeeded; avoid surfacing a false-negative to the UI.
  }
}

export async function restoreCustomer(args: {
  supabase: SupabaseClient;
  customerId: string;
  actorUserId: string;
  actorName: string;
}) {
  const { supabase, customerId, actorUserId, actorName } = args;
  const customer = await fetchLifecycleCustomerRow(supabase, customerId);
  if (!customer) throw new Error('Customer not found');

  const { data: stateRow, error: stateErr } = await supabase
    .from('customers')
    .select('anonymized_at')
    .eq('id', customerId)
    .maybeSingle();
  if (stateErr) {
    throw new Error(stateErr.message);
  }
  const anonymizedAt = (stateRow as { anonymized_at?: string | null } | null)?.anonymized_at ?? null;
  if (!canRestoreCustomerState(anonymizedAt)) {
    throw new Error('Anonymized customers cannot be restored.');
  }

  const { error } = await supabase
    .from('customers')
    .update({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      is_active: true,
      deletion_locked_reason: null,
    })
    .eq('id', customerId);
  if (error) {
    const msg = String(error.message ?? '');
    if (msg.includes('archived_at') || msg.includes('is_active')) {
      throw new Error(
        'Customer lifecycle columns are not available yet. Please run migration 089_customers_archive_anonymize_controls.sql and retry.'
      );
    }
    throw new Error(msg || 'Failed to restore customer');
  }

  try {
    await createActivity(supabase, {
      business_id: String(customer.business_id),
      eventType: 'customer_updated',
      title: 'Customer restored',
      description: 'Customer was restored to active status',
      entityType: 'customer',
      entityId: customerId,
    });
    await logAuditEvent(supabase, {
      businessId: String(customer.business_id),
      entityType: 'customer',
      entityId: customerId,
      action: 'restored',
      performedByUserId: actorUserId,
      performedByName: actorName,
      metadata: {
        stripe_customer_id: customer.stripe_customer_id ?? null,
        financial_history: true,
      },
    });
  } catch {
    // Restore already succeeded; avoid surfacing a false-negative to the UI.
  }
}

export async function anonymizeCustomer(args: {
  supabase: SupabaseClient;
  customerId: string;
  actorUserId: string;
  actorName: string;
  reason?: string | null;
}) {
  const { supabase, customerId, actorUserId, actorName, reason } = args;
  const now = new Date().toISOString();
  const customer = await fetchLifecycleCustomerRow(supabase, customerId);
  if (!customer) throw new Error('Customer not found');

  await detachStripePaymentMethods(String(customer.stripe_customer_id ?? '') || null);

  const alias = `Redacted ${String(customer.account_number ?? customerId).slice(0, 12)}`;
  const { error } = await supabase
    .from('customers')
    .update(
      buildAnonymizedCustomerPatch({
        alias,
        actorUserId,
        nowIso: now,
      })
    )
    .eq('id', customerId);
  if (error) {
    const msg = String(error.message ?? '');
    if (msg.includes('archived_at') || msg.includes('anonymized_at') || msg.includes('is_active')) {
      throw new Error(
        'Customer lifecycle columns are not available yet. Please run migration 089_customers_archive_anonymize_controls.sql and retry.'
      );
    }
    throw new Error(msg || 'Failed to anonymize customer');
  }

  try {
    await createActivity(supabase, {
      business_id: String(customer.business_id),
      eventType: 'customer_updated',
      title: 'Customer anonymized',
      description: 'Personally identifiable fields were redacted',
      entityType: 'customer',
      entityId: customerId,
    });
    await logAuditEvent(supabase, {
      businessId: String(customer.business_id),
      entityType: 'customer',
      entityId: customerId,
      action: 'anonymized',
      performedByUserId: actorUserId,
      performedByName: actorName,
      metadata: {
        reason: reason ?? null,
        stripe_customer_id: customer.stripe_customer_id ?? null,
        redacted_fields: [
          'name',
          'email',
          'phone',
          'company',
          'address_line1',
          'address_line2',
          'city',
          'state',
          'postal_code',
          'country',
        ],
        financial_history: true,
      },
    });
  } catch {
    // Anonymization already succeeded; avoid surfacing a false-negative to the UI.
  }
}

export async function hardDeleteCustomer(args: {
  supabase: SupabaseClient;
  customerId: string;
  actorUserId: string;
  actorName: string;
}) {
  const { supabase, customerId, actorUserId, actorName } = args;
  const customer = await fetchLifecycleCustomerRow(supabase, customerId);
  if (!customer) throw new Error('Customer not found');

  const decision = await canHardDeleteCustomer(supabase, customerId);
  if (!decision.allowed) {
    await logAuditEvent(supabase, {
      businessId: String(customer.business_id),
      entityType: 'customer',
      entityId: customerId,
      action: 'hard_delete_attempted',
      performedByUserId: actorUserId,
      performedByName: actorName,
      metadata: {
        allowed: false,
        blockers: decision.blockers,
        stripe_customer_id: customer.stripe_customer_id ?? null,
        financial_history: true,
      },
    });
    return decision;
  }

  const stripeCustomerId = String(customer.stripe_customer_id ?? '').trim();
  if (stripeCustomerId) {
    const stripe = getStripeOrNull();
    if (stripe) {
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch {
        // best effort
      }
    }
  }

  const { error } = await supabase.from('customers').delete().eq('id', customerId);
  if (error) throw new Error(error.message);

  await createActivity(supabase, {
    business_id: String(customer.business_id),
    eventType: 'customer_deleted',
    title: 'Customer permanently deleted',
    description: 'Customer had no financial history and was hard deleted',
    entityType: 'customer',
    entityId: customerId,
  });
  await logAuditEvent(supabase, {
    businessId: String(customer.business_id),
    entityType: 'customer',
    entityId: customerId,
    action: 'hard_deleted',
    performedByUserId: actorUserId,
    performedByName: actorName,
    metadata: {
      stripe_customer_id: customer.stripe_customer_id ?? null,
      customer_label: customer.company || customer.name || customerId,
      financial_history: false,
    },
  });
  return { allowed: true, reason: null, blockers: [] } as HardDeleteDecision;
}
