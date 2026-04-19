import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { INSIGHTS_ANALYSIS_SYSTEM, insightsAnalysisUser } from '@/lib/ai/prompts/insights';
import type { AiInsight } from '@/lib/database.types';
import type { DashboardFinancialRange } from '@/lib/dashboard/date-range';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface InsightInput {
  type: string;
  title: string;
  summary: string;
  severity: string;
  action_label?: string;
  action_url?: string;
}

/**
 * Fetch business aggregates, then run AI to generate insights. Insert into ai_insights.
 */
export async function generateInsights(
  supabase: SupabaseClient,
  businessId: string,
  financialWindow?: DashboardFinancialRange | null
): Promise<AiInsight[]> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

  const [invoices, payments, customers] = await Promise.all([
    supabase.from('invoices').select('total, status, due_date, customer_id').eq('business_id', businessId),
    supabase.from('payments').select('amount, amount_in_base, created_at').eq('business_id', businessId),
    supabase.from('customers').select('id').eq('business_id', businessId),
  ]);

  const inv = invoices.data ?? [];
  const outstanding_total = inv
    .filter((i) => i.status === 'sent' || i.status === 'viewed')
    .reduce((s, i) => s + Number(i.total), 0);
  const overdue = inv.filter((i) => i.status === 'overdue');
  const overdue_total = overdue.reduce((s, i) => s + Number(i.total), 0);
  const pay = payments.data ?? [];
  const payAmount = (p: { amount?: number; amount_in_base?: number | null }) =>
    p.amount_in_base != null && !Number.isNaN(Number(p.amount_in_base))
      ? Number(p.amount_in_base)
      : Number(p.amount ?? 0);
  const revenue_this_month = pay
    .filter((p) => p.created_at >= thisMonthStart)
    .reduce((s, p) => s + payAmount(p as { amount?: number; amount_in_base?: number | null }), 0);
  const revenue_last_month = pay
    .filter((p) => p.created_at >= lastMonthStart && p.created_at <= lastMonthEnd)
    .reduce((s, p) => s + payAmount(p as { amount?: number; amount_in_base?: number | null }), 0);
  let revenue_in_dashboard_period: number | undefined;
  if (financialWindow) {
    revenue_in_dashboard_period = pay
      .filter((p) => p.created_at >= financialWindow.startIso && p.created_at <= financialWindow.endIso)
      .reduce((s, p) => s + payAmount(p as { amount?: number; amount_in_base?: number | null }), 0);
  }

  const byCustomer: Record<string, number> = {};
  for (const i of inv) {
    const key = i.customer_id ?? 'unknown';
    byCustomer[key] = (byCustomer[key] ?? 0) + Number(i.total);
  }
  const top_customers = Object.entries(byCustomer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }));

  const payload = {
    outstanding_total,
    overdue_count: overdue.length,
    overdue_total,
    revenue_this_month,
    revenue_last_month,
    customers_count: customers.data?.length ?? 0,
    top_customers,
    recent_payments: pay.length,
    dashboard_period_label: financialWindow?.label ?? null,
    revenue_in_dashboard_period: revenue_in_dashboard_period,
  };

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: INSIGHTS_ANALYSIS_SYSTEM },
      { role: 'user', content: insightsAnalysisUser(payload) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return [];

  let arr: InsightInput[];
  try {
    const parsed = JSON.parse(raw);
    arr = Array.isArray(parsed) ? parsed : parsed.insights ? parsed.insights : [];
  } catch {
    return [];
  }

  const inserted: AiInsight[] = [];
  for (const insight of arr) {
    const { data, error } = await supabase
      .from('ai_insights')
      .insert({
        business_id: businessId,
        type: insight.type ?? 'recommendation',
        title: insight.title ?? 'Insight',
        summary: insight.summary ?? null,
        detail: null,
        severity: insight.severity ?? 'info',
        action_label: insight.action_label ?? null,
        action_url: insight.action_url ?? null,
      })
      .select()
      .single();
    if (!error && data) inserted.push(data as AiInsight);
  }

  return inserted;
}
