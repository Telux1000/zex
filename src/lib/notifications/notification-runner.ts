import { addDays } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Invoice, Quote } from '@/lib/database.types';
import type { NotificationCandidate, NotificationModel } from './types';
import { generateNotificationCandidates } from './intelligence-engine';

type NotificationDbRow = NotificationModel;

type ExpenseRowDb = {
  id: string;
  expense_date: string;
  category: string | null;
  amount: number | null;
  currency?: string | null;
  base_amount?: number | null;
  exchange_rate?: number | null;
};

type PaymentRowDb = {
  id: string;
  created_at: string | null;
  status: string | null;
  amount_in_base: number | null;
  amount: number | null;
};

export async function runNotificationIntelligenceForBusiness({
  supabase,
  businessId,
  baseCurrencyCode,
  nowIso,
}: {
  supabase: SupabaseClient;
  businessId: string;
  baseCurrencyCode: string;
  nowIso: string;
}): Promise<{ notifications: NotificationDbRow[]; unreadActionableCount: number }> {
  const now = new Date(nowIso);
  const sinceExpensesIso = addDays(now, -60).toISOString();
  const sincePaymentsIso = addDays(now, -45).toISOString();

  const [{ data: invoices }, { data: quotes }, { data: expenses }, { data: payments }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, customer_name, due_date, status, total, balance_due, amount_paid, exchange_rate_to_base, total_in_base, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('quotes')
      .select('id, quote_number, customer_snapshot, issue_date, expiry_date, status, total, currency, converted_invoice_id, accepted_at, rejected_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('expenses')
      .select('id, expense_date, category, amount, currency, base_amount, exchange_rate')
      .eq('business_id', businessId)
      .gte('expense_date', sinceExpensesIso.slice(0, 10)),
    supabase
      .from('payments')
      .select('id, created_at, status, amount_in_base, amount')
      .eq('business_id', businessId)
      .gte('created_at', sincePaymentsIso),
  ]);

  const invoiceRows = (invoices ?? []) as unknown as Invoice[];
  const quoteRows = (quotes ?? []) as unknown as Quote[];
  const expenseRows = (expenses ?? []) as ExpenseRowDb[];
  const paymentRows = (payments ?? []) as PaymentRowDb[];

  const candidates: NotificationCandidate[] = generateNotificationCandidates({
    baseCurrencyCode,
    nowIso,
    invoices: (invoiceRows ?? []).map((inv) => ({
      id: String((inv as any).id),
      invoice_number: String((inv as any).invoice_number ?? ''),
      customer_name: String((inv as any).customer_name ?? ''),
      due_date: String((inv as any).due_date ?? ''),
      status: (inv as any).status ?? null,
      total: (inv as any).total ?? null,
      balance_due: (inv as any).balance_due ?? null,
      exchange_rate_to_base: (inv as any).exchange_rate_to_base ?? null,
      total_in_base: (inv as any).total_in_base ?? null,
      created_at: (inv as any).created_at ?? null,
    })),
    quotes: (quoteRows ?? []).map((q) => ({
      id: String((q as any).id),
      quote_number: String((q as any).quote_number ?? ''),
      customer_snapshot: (q as any).customer_snapshot ?? null,
      issue_date: (q as any).issue_date ?? null,
      expiry_date: (q as any).expiry_date ?? null,
      status: (q as any).status ?? null,
      total: (q as any).total ?? null,
      currency: (q as any).currency ?? null,
      converted_invoice_id: (q as any).converted_invoice_id ?? null,
      accepted_at: (q as any).accepted_at ?? null,
      rejected_at: (q as any).rejected_at ?? null,
    })),
    expenses: (expenseRows ?? []).map((e) => ({
      id: e.id,
      expense_date: e.expense_date,
      category: e.category,
      amount: e.amount,
      currency: e.currency ?? null,
      base_amount: e.base_amount ?? null,
      exchange_rate: e.exchange_rate ?? null,
    })),
    payments: (paymentRows ?? []).map((p) => ({
      id: p.id,
      created_at: p.created_at,
      status: p.status,
      amount_in_base: p.amount_in_base,
      amount: p.amount,
    })),
  });

  const upserts = candidates.map((c) => ({
    business_id: businessId,
    type: c.type,
    category: c.category,
    title: c.title,
    description: c.description,
    severity: c.severity,
    priority_score: c.priorityScore,
    action_label: c.actionLabel ?? null,
    action_target: c.actionTarget ?? null,
    group_key: c.groupKey,
    metadata: c.metadata ?? {},
  }));

  if (upserts.length > 0) {
    await supabase
      .from('notifications')
      .upsert(upserts, { onConflict: 'business_id,group_key,type' });
  }

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, business_id, type, category, title, description, severity, priority_score, action_label, action_target, created_at, read, dismissed, group_key, metadata')
    .eq('business_id', businessId)
    .eq('dismissed', false)
    .order('read', { ascending: true }) // read=false first, because false < true
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20);

  const notifRows = (notifications ?? []) as any[];

  const unreadActionableCount = await (async () => {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('dismissed', false)
      .eq('read', false)
      .neq('severity', 'low');
    return count ?? 0;
  })();

  const mapped = notifRows.map((n) => ({
    id: String(n.id),
    type: n.type,
    category: n.category,
    title: n.title,
    description: n.description ?? '',
    severity: n.severity,
    priorityScore: Number(n.priority_score ?? 0),
    actionLabel: n.action_label ?? null,
    actionTarget: n.action_target ?? null,
    createdAt: String(n.created_at),
    read: Boolean(n.read),
    dismissed: Boolean(n.dismissed),
    groupKey: n.group_key,
    metadata: (n.metadata ?? {}) as Record<string, unknown>,
  })) as NotificationDbRow[];

  return { notifications: mapped, unreadActionableCount };
}

