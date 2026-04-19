import type { SupabaseClient } from '@supabase/supabase-js';
import { autoSendInvoiceIfEligible } from '@/lib/invoices/auto-send';
import { addRecurringInterval } from '@/lib/recurring-invoice/schedule';
import { createInvoiceFromRecurringTemplate } from '@/lib/recurring-invoice/generate-invoice';
import {
  RECURRING_FREQUENCIES,
  recurringTemplateSnapshotSchema,
  type RecurringFrequency,
  type RecurringRuleRow,
} from '@/lib/recurring-invoice/types';

function isFrequency(v: string): v is RecurringFrequency {
  return (RECURRING_FREQUENCIES as readonly string[]).includes(v);
}

function parseRuleRow(row: Record<string, unknown>): RecurringRuleRow | null {
  const snap = recurringTemplateSnapshotSchema.safeParse(row.template_snapshot);
  if (!snap.success) return null;
  const freq = String(row.frequency ?? '');
  if (!isFrequency(freq)) return null;
  return {
    id: String(row.id),
    business_id: String(row.business_id),
    source_invoice_id: row.source_invoice_id ? String(row.source_invoice_id) : null,
    template_snapshot: snap.data,
    frequency: freq,
    start_date: String(row.start_date),
    next_run_date: String(row.next_run_date),
    end_condition_type: row.end_condition_type as RecurringRuleRow['end_condition_type'],
    end_date: row.end_date ? String(row.end_date) : null,
    end_after_count: row.end_after_count != null ? Number(row.end_after_count) : null,
    automation_mode: row.automation_mode as RecurringRuleRow['automation_mode'],
    status: row.status as RecurringRuleRow['status'],
    invoices_generated_count: Number(row.invoices_generated_count ?? 0),
    last_generated_invoice_id: row.last_generated_invoice_id ? String(row.last_generated_invoice_id) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function shouldStopAfterAdvance(rule: RecurringRuleRow, newNextRun: string, newCount: number): boolean {
  if (rule.end_condition_type === 'count' && rule.end_after_count != null && newCount >= rule.end_after_count) {
    return true;
  }
  if (rule.end_condition_type === 'end_date' && rule.end_date != null && newNextRun > rule.end_date) {
    return true;
  }
  return false;
}

export type ProcessRecurringRulesResult = {
  today: string;
  generated: number;
  skipped: number;
  failed: number;
  details: Array<{ ruleId: string; ok: boolean; error?: string }>;
};

/**
 * Daily job: active rules with next_run_date <= today receive a new invoice; next_run advances.
 * Uses conditional updates on next_run_date to reduce double-processing.
 */
export async function processDueRecurringInvoiceRules(
  supabase: SupabaseClient,
  todayIso: string
): Promise<ProcessRecurringRulesResult> {
  const { data: rawRows, error } = await supabase
    .from('recurring_invoice_rules')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_date', todayIso);

  if (error) throw new Error(error.message);

  const result: ProcessRecurringRulesResult = {
    today: todayIso,
    generated: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const raw of rawRows ?? []) {
    const rule = parseRuleRow(raw as Record<string, unknown>);
    if (!rule) {
      result.failed += 1;
      result.details.push({ ruleId: String((raw as { id?: string }).id ?? ''), ok: false, error: 'bad_snapshot' });
      continue;
    }

    if (rule.end_condition_type === 'end_date' && rule.end_date && rule.next_run_date > rule.end_date) {
      await supabase.from('recurring_invoice_rules').update({ status: 'cancelled' }).eq('id', rule.id);
      result.skipped += 1;
      result.details.push({ ruleId: rule.id, ok: true });
      continue;
    }

    if (rule.end_condition_type === 'count' && rule.end_after_count != null) {
      if (rule.invoices_generated_count >= rule.end_after_count) {
        await supabase.from('recurring_invoice_rules').update({ status: 'cancelled' }).eq('id', rule.id);
        result.skipped += 1;
        result.details.push({ ruleId: rule.id, ok: true });
        continue;
      }
    }

    const oldNext = rule.next_run_date;

    let createdInvoiceId: string | null = null;
    let ruleAdvanced = false;
    try {
      const { invoiceId } = await createInvoiceFromRecurringTemplate(supabase, {
        businessId: rule.business_id,
        issueDateIso: oldNext,
        templateSnapshot: rule.template_snapshot,
        recurringRuleId: rule.id,
        actorUserId: rule.created_by,
        actorName: 'Recurring invoice',
      });
      createdInvoiceId = invoiceId;

      const newCount = rule.invoices_generated_count + 1;
      const newNext = addRecurringInterval(oldNext, rule.frequency);
      const stop = shouldStopAfterAdvance(rule, newNext, newCount);

      const { data: updated, error: upErr } = await supabase
        .from('recurring_invoice_rules')
        .update({
          invoices_generated_count: newCount,
          last_generated_invoice_id: invoiceId,
          next_run_date: newNext,
          status: stop ? 'cancelled' : 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', rule.id)
        .eq('next_run_date', oldNext)
        .select('id');

      if (upErr) throw new Error(upErr.message);
      if (!updated?.length) {
        await supabase.from('invoices').delete().eq('id', createdInvoiceId);
        result.skipped += 1;
        result.details.push({ ruleId: rule.id, ok: true });
        continue;
      }

      ruleAdvanced = true;

      if (rule.automation_mode === 'auto_send') {
        await autoSendInvoiceIfEligible(supabase, { invoiceId, businessId: rule.business_id });
      }

      result.generated += 1;
      result.details.push({ ruleId: rule.id, ok: true });
    } catch (e) {
      if (createdInvoiceId && !ruleAdvanced) {
        await supabase.from('invoices').delete().eq('id', createdInvoiceId);
      }
      result.failed += 1;
      const msg = e instanceof Error ? e.message : 'unknown_error';
      result.details.push({ ruleId: rule.id, ok: false, error: msg });
    }
  }

  return result;
}
