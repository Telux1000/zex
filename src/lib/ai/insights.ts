import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiInsight } from '@/lib/database.types';
import { claudeJson } from '@/lib/ai/claude';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { statusForFilter } from '@/lib/invoices/list-filters';
import type { DashboardFinancialRange } from '@/lib/dashboard/date-range';

type InsightSeverity = 'low' | 'medium' | 'high';
type InsightType = 'risk' | 'forecast' | 'reminder' | 'behavior' | 'opportunity';

export type ClaudeInsightCard = {
  type: InsightType;
  title: string;
  summary: string;
  severity: InsightSeverity;
  suggested_action?: string | null;
  supporting_facts?: string[];
};

type InsightContext = {
  business_id: string;
  as_of: string;
  totals: {
    open_invoices_count: number;
    overdue_count: number;
    due_in_3_days_count: number;
    outstanding_total: number;
    overdue_total: number;
    expected_cash_7_days: number;
  };
  open_invoices: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    total: number;
    amount_paid: number;
    due_date: string;
    balance_due: number;
    payment_count: number;
    payment_total: number;
    last_payment_at: string | null;
    derived_status: string;
    status: string;
  }>;
  overdue_invoices: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    due_date: string;
    balance_due: number;
  }>;
  due_soon_invoices: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    due_date: string;
    balance_due: number;
  }>;
  customer_payment_behavior: Array<{
    customer_name: string;
    invoice_count: number;
    avg_days_to_pay: number | null;
  }>;
  /** When set, revenue-style answers should prefer totals in this window (matches dashboard range). */
  active_financial_window?: {
    preset: string;
    label: string;
    start_iso: string;
    end_iso: string;
    payments_total_in_period: number;
    payments_count_in_period: number;
  };
};

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

async function buildInsightContext(
  supabase: SupabaseClient,
  businessId: string,
  financialWindow?: DashboardFinancialRange | null
): Promise<InsightContext> {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const in3 = new Date(today);
  in3.setDate(in3.getDate() + 3);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const in3Iso = in3.toISOString().slice(0, 10);
  const in7Iso = in7.toISOString().slice(0, 10);

  const { data: invoices } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, customer_name, status, due_date, issue_date, total, amount_paid, balance_due, paid_at'
    )
    .eq('business_id', businessId);

  const invoiceIds = (invoices ?? []).map((r) => String(r.id));
  const paymentsByInvoice = new Map<string, { payment_count: number; payment_total: number; last_payment_at: string | null }>();
  if (invoiceIds.length > 0) {
    const { data: payments } = await supabase
      .from('payments')
      .select('invoice_id, amount, created_at')
      .in('invoice_id', invoiceIds)
      .order('created_at', { ascending: false });

    for (const p of payments ?? []) {
      const invoiceId = String((p as { invoice_id?: string | null }).invoice_id ?? '');
      if (!invoiceId) continue;
      const current = paymentsByInvoice.get(invoiceId) ?? {
        payment_count: 0,
        payment_total: 0,
        last_payment_at: null,
      };
      current.payment_count += 1;
      current.payment_total = Math.round((current.payment_total + Number((p as { amount?: number }).amount ?? 0)) * 100) / 100;
      if (!current.last_payment_at) {
        current.last_payment_at = String((p as { created_at?: string }).created_at ?? '');
      }
      paymentsByInvoice.set(invoiceId, current);
    }
  }

  const rows = (invoices ?? []).map((r) => {
    const paid = Number(r.amount_paid ?? 0);
    const total = Number(r.total ?? 0);
    const balance =
      r.balance_due != null ? Number(r.balance_due) : Math.max(0, total - paid);
    const derivedStatus = deriveInvoiceStatus({
      status: r.status,
      total,
      amount_paid: paid,
      balance_due: balance,
    });
    const displayStatus = statusForFilter({
      due_date: String(r.due_date ?? ''),
      status: derivedStatus,
    });
    const paymentSummary = paymentsByInvoice.get(String(r.id)) ?? {
      payment_count: 0,
      payment_total: 0,
      last_payment_at: null,
    };
    return {
      ...r,
      total_safe: total,
      amount_paid_safe: paid,
      balance_due_safe: Math.max(0, balance),
      derived_status: derivedStatus,
      display_status: displayStatus,
      payment_count: paymentSummary.payment_count,
      payment_total: paymentSummary.payment_total,
      last_payment_at: paymentSummary.last_payment_at,
    };
  });

  const open = rows.filter(
    (r) =>
      !['paid', 'voided'].includes(String(r.derived_status ?? '')) &&
      r.balance_due_safe > 0
  );
  const overdue = open.filter((r) => String(r.due_date) < isoToday);
  const dueSoon = open.filter(
    (r) => String(r.due_date) >= isoToday && String(r.due_date) <= in3Iso
  );
  const expectedCash7 = open
    .filter((r) => String(r.due_date) >= isoToday && String(r.due_date) <= in7Iso)
    .reduce((s, r) => s + r.balance_due_safe, 0);

  const byCustomer = new Map<string, { count: number; days: number[] }>();
  for (const r of rows) {
    if (String(r.status) !== 'paid' || !r.paid_at || !r.issue_date) continue;
    const key = String(r.customer_name ?? '').trim() || 'Unknown customer';
    const val = byCustomer.get(key) ?? { count: 0, days: [] };
    val.count += 1;
    val.days.push(daysBetween(new Date(String(r.paid_at)), new Date(String(r.issue_date))));
    byCustomer.set(key, val);
  }
  const customer_payment_behavior = Array.from(byCustomer.entries())
    .map(([customer_name, v]) => ({
      customer_name,
      invoice_count: v.count,
      avg_days_to_pay:
        v.days.length > 0
          ? Math.round((v.days.reduce((s, d) => s + d, 0) / v.days.length) * 10) / 10
          : null,
    }))
    .sort((a, b) => b.invoice_count - a.invoice_count)
    .slice(0, 10);

  let active_financial_window: InsightContext['active_financial_window'];
  if (financialWindow) {
    const { data: periodPay } = await supabase
      .from('payments')
      .select('amount, amount_in_base')
      .eq('business_id', businessId)
      .gte('created_at', financialWindow.startIso)
      .lte('created_at', financialWindow.endIso);
    let periodTotal = 0;
    for (const p of periodPay ?? []) {
      const row = p as { amount?: number; amount_in_base?: number | null };
      const a =
        row.amount_in_base != null && !Number.isNaN(Number(row.amount_in_base))
          ? Number(row.amount_in_base)
          : Number(row.amount ?? 0);
      periodTotal += a;
    }
    active_financial_window = {
      preset: financialWindow.preset,
      label: financialWindow.label,
      start_iso: financialWindow.startIso,
      end_iso: financialWindow.endIso,
      payments_total_in_period: Math.round(periodTotal * 100) / 100,
      payments_count_in_period: (periodPay ?? []).length,
    };
  }

  return {
    business_id: businessId,
    as_of: new Date().toISOString(),
    totals: {
      open_invoices_count: open.length,
      overdue_count: overdue.length,
      due_in_3_days_count: dueSoon.length,
      outstanding_total: Math.round(open.reduce((s, r) => s + r.balance_due_safe, 0) * 100) / 100,
      overdue_total: Math.round(overdue.reduce((s, r) => s + r.balance_due_safe, 0) * 100) / 100,
      expected_cash_7_days: Math.round(expectedCash7 * 100) / 100,
    },
    open_invoices: open.slice(0, 30).map((r) => ({
      id: r.id,
      invoice_number: String(r.invoice_number ?? ''),
      customer_name: String(r.customer_name ?? ''),
      total: r.total_safe,
      amount_paid: r.amount_paid_safe,
      due_date: String(r.due_date ?? ''),
      balance_due: r.balance_due_safe,
      payment_count: r.payment_count,
      payment_total: r.payment_total,
      last_payment_at: r.last_payment_at,
      derived_status: String(r.display_status ?? ''),
      status: String(r.display_status ?? ''),
    })),
    overdue_invoices: overdue.slice(0, 20).map((r) => ({
      id: r.id,
      invoice_number: String(r.invoice_number ?? ''),
      customer_name: String(r.customer_name ?? ''),
      due_date: String(r.due_date ?? ''),
      balance_due: r.balance_due_safe,
    })),
    due_soon_invoices: dueSoon.slice(0, 20).map((r) => ({
      id: r.id,
      invoice_number: String(r.invoice_number ?? ''),
      customer_name: String(r.customer_name ?? ''),
      due_date: String(r.due_date ?? ''),
      balance_due: r.balance_due_safe,
    })),
    customer_payment_behavior,
    ...(active_financial_window ? { active_financial_window } : {}),
  };
}

function toInsightRows(
  businessId: string,
  cards: ClaudeInsightCard[]
): Omit<AiInsight, 'id' | 'created_at'>[] {
  return cards.map((c) => ({
    business_id: businessId,
    type: c.type,
    title: c.title,
    summary: c.summary,
    detail: null,
    severity: c.severity,
    action_label: c.suggested_action ?? null,
    action_url: null,
    metadata: {
      provider: 'claude',
      supporting_facts: c.supporting_facts ?? [],
    },
  }));
}

export async function generateClaudeInsights(
  supabase: SupabaseClient,
  businessId: string,
  financialWindow?: DashboardFinancialRange | null
): Promise<AiInsight[]> {
  const context = await buildInsightContext(supabase, businessId, financialWindow);

  const system = [
    'You are a finance operations analyst.',
    'Use ONLY the provided structured JSON context.',
    'Do not invent values, records, customers, invoices, or dates.',
    'When active_financial_window is present, treat payments_total_in_period as paid revenue in the user’s selected dashboard date range.',
    'Return concise, action-oriented JSON only.',
  ].join(' ');

  const prompt = [
    'Generate 4-8 ranked business insights for this business context.',
    'Output JSON with shape:',
    '{"insights":[{"type":"risk|forecast|reminder|behavior|opportunity","title":"...","summary":"...","severity":"low|medium|high","suggested_action":"...","supporting_facts":["..."]}]}',
    'Rank by urgency first.',
    `Context JSON:\n${JSON.stringify(context)}`,
  ].join('\n');

  const output = await claudeJson<{ insights?: ClaudeInsightCard[] }>({
    system,
    prompt,
    maxTokens: 1800,
  });

  const cards = (output.insights ?? []).filter((i) => i?.title && i?.summary);
  if (!cards.length) return [];

  const payload = toInsightRows(businessId, cards);
  const { data, error } = await supabase
    .from('ai_insights')
    .insert(payload)
    .select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as AiInsight[];
}

export async function askClaudeBusinessQuestion(
  supabase: SupabaseClient,
  businessId: string,
  question: string,
  financialWindow?: DashboardFinancialRange | null
): Promise<{ answer: string; supporting_facts: string[] }> {
  const context = await buildInsightContext(supabase, businessId, financialWindow);
  const system = [
    'You are a finance analyst assistant.',
    'Use ONLY provided context JSON.',
    'Do not invent values or records.',
    'For invoice status, prefer context derived_status/status, not raw labels.',
    'Treat partial payment as amount_paid > 0 and balance_due > 0.',
    'When active_financial_window is present, use it for questions about revenue or payments in the user’s selected period.',
    'Answer concisely and include key supporting facts.',
  ].join(' ');
  const prompt = [
    'Answer the user question using the context. Keep it short and business-friendly.',
    'Output JSON: {"answer":"...","supporting_facts":["..."]}',
    `Question: ${question}`,
    `Context JSON:\n${JSON.stringify(context)}`,
  ].join('\n');

  const out = await claudeJson<{ answer?: string; supporting_facts?: string[] }>({
    system,
    prompt,
    maxTokens: 900,
  });
  return {
    answer: out.answer ?? 'No answer available for this question.',
    supporting_facts: out.supporting_facts ?? [],
  };
}

