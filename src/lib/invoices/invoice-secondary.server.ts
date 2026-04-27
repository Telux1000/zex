import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPermission } from '@/lib/rbac/permissions';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import {
  enrichAuditLogActorDisplayRows,
  enrichAuditLogsWithTeamMemberDisplayNames,
  type AuditLogRow,
} from '@/lib/audit-log';
import { computeInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { sumRefundedSucceededAndPendingForInvoice } from '@/lib/invoices/invoice-payment-summary';
import {
  applyRefundDisplayStatus,
  canShowRefundMenuAction,
  resolveRefundDisplayStatus,
} from '@/lib/invoices/refund-display';
import { fetchDedupeKeysForInvoice, resolveNextReminderForInvoiceDisplay } from '@/lib/invoices/next-pending-reminder';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import {
  recurringSummaryFromRuleRow,
  type RecurringRuleListFields,
  type InvoiceRecurringSummary,
} from '@/lib/recurring-invoice/display';
import {
  buildInvoiceDashboardCoreSelect,
  buildInvoiceDashboardFallbackSelect,
  INVOICE_BUSINESS_STANDALONE_SELECT,
} from '@/lib/invoices/invoice-detail-core-select';
import type { InvoiceDetailSecondaryPayload } from '@/lib/invoices/invoice-secondary-payload';

type LoadResult = InvoiceDetailSecondaryPayload | { error: 'not_found' } | { error: 'forbidden' };

/**
 * Activity, reminders, recurring, refund-accurate status — previously on the detail RSC.
 * Call from GET secondary-panels after the lean first paint.
 */
export async function loadInvoiceDetailSecondaryData(
  supabase: SupabaseClient,
  userId: string,
  invoiceId: string
): Promise<LoadResult> {
  let { data: row, error: invErr } = await supabase
    .from('invoices')
    .select(buildInvoiceDashboardCoreSelect())
    .eq('id', invoiceId)
    .single();
  if (invErr || !row) {
    const fb = await supabase
      .from('invoices')
      .select(buildInvoiceDashboardFallbackSelect())
      .eq('id', invoiceId)
      .single();
    row = fb.data;
    invErr = fb.error;
  }
  if (invErr || !row) {
    return { error: 'not_found' };
  }

  const r = row as any;
  let business = r.businesses as { id: string } | null;
  if (!business && r.business_id) {
    const { data: b } = await supabase
      .from('businesses')
      .select(INVOICE_BUSINESS_STANDALONE_SELECT)
      .eq('id', String(r.business_id))
      .maybeSingle();
    business = b as { id: string } | null;
  }
  if (!business?.id) {
    return { error: 'not_found' };
  }

  const role = await getEffectiveBusinessRole(supabase, business.id, userId);
  if (!role || !hasPermission(role, 'view_data')) {
    return { error: 'forbidden' };
  }

  const recurringRid = String((r as { recurring_rule_id?: string | null }).recurring_rule_id ?? '').trim() || null;
  const [refundRes, auditRes, sentKeys, ruleByIdRes, ruleBySourceRes] = await Promise.all([
    supabase.from('payment_refunds').select('amount, status').eq('invoice_id', r.id),
    supabase
      .from('audit_logs')
      .select('*')
      .eq('business_id', business.id)
      .eq('entity_type', 'invoice')
      .eq('entity_id', r.id)
      .order('created_at', { ascending: false }),
    fetchDedupeKeysForInvoice(supabase, r.id),
    recurringRid
      ? supabase
          .from('recurring_invoice_rules')
          .select('id, source_invoice_id, frequency, next_run_date, automation_mode, status')
          .eq('business_id', business.id)
          .eq('id', recurringRid)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('recurring_invoice_rules')
      .select('id, source_invoice_id, frequency, next_run_date, automation_mode, status')
      .eq('business_id', business.id)
      .eq('source_invoice_id', r.id)
      .maybeSingle(),
  ]);

  const refundRows = refundRes.data;
  const auditRowsRaw = auditRes.data;
  const refundedTotal = sumRefundedSucceededAndPendingForInvoice(refundRows ?? []);

  let auditRows = (auditRowsRaw ?? []) as AuditLogRow[];
  auditRows = await enrichAuditLogsWithTeamMemberDisplayNames(supabase, auditRows);
  auditRows = await enrichAuditLogActorDisplayRows(supabase, auditRows);

  let recurringSummary: InvoiceRecurringSummary | null = null;
  if (ruleByIdRes.data) {
    recurringSummary = recurringSummaryFromRuleRow(ruleByIdRes.data as RecurringRuleListFields, 'generated');
  } else if (ruleBySourceRes.data) {
    recurringSummary = recurringSummaryFromRuleRow(ruleBySourceRes.data as RecurringRuleListFields, 'template');
  }

  const customerReminderSettings =
    (r as { customers?: { reminder_settings?: unknown } | null }).customers?.reminder_settings ?? null;

  const amountPaidNum = r.amount_paid != null ? Number(r.amount_paid) : 0;
  const totalRefundedNum =
    (r as { total_refunded?: number | null }).total_refunded != null
      ? Number((r as { total_refunded?: number | null }).total_refunded)
      : 0;
  const rawStForBal = String(r.status ?? '').toLowerCase();
  const balanceDueNum =
    rawStForBal === 'voided' || rawStForBal === 'cancelled'
      ? 0
      : computeInvoiceBalanceDue(Number(r.total ?? 0), amountPaidNum, totalRefundedNum);
  const derivedStatus = deriveInvoiceStatus({
    status: String(r.status ?? ''),
    total: Number(r.total),
    amount_paid: amountPaidNum,
    balance_due: balanceDueNum,
    total_refunded: totalRefundedNum,
  });
  const refundDisplayStatus = resolveRefundDisplayStatus({
    grossPaidAmount: amountPaidNum,
    refundedAmount: refundedTotal,
  });
  const displayStatus = applyRefundDisplayStatus(derivedStatus, refundDisplayStatus);
  const rawInvoiceStatus = String(r.status ?? '').toLowerCase();
  const showRefundAction = canShowRefundMenuAction({
    status: rawInvoiceStatus,
    grossPaidSucceeded: amountPaidNum,
    refundedSucceededAndPending: refundedTotal,
  });

  const nextReminder = resolveNextReminderForInvoiceDisplay({
    inv: {
      status: derivedStatus,
      total: Number(r.total),
      amount_paid: amountPaidNum,
      balance_due: balanceDueNum,
      due_date: String(r.due_date ?? ''),
      use_customer_reminder_defaults:
        (r as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false,
      reminder_settings: (r as { reminder_settings?: unknown }).reminder_settings ?? null,
      customer_reminder_settings: customerReminderSettings,
    },
    sentDedupeKeys: sentKeys,
  });

  return {
    auditLogs: auditRows,
    nextReminderStatusLine: nextReminder.next_reminder_status_line,
    recurringSummary,
    displayStatus,
    showRefundAction,
  };
}
