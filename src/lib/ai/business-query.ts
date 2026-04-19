import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BUSINESS_QUERY_SYSTEM, businessQueryUser } from '@/lib/ai/prompts/business-query';
import type { DashboardFinancialRange } from '@/lib/dashboard/date-range';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type BusinessQueryType =
  | 'overdue_invoices'
  | 'outstanding_invoices'
  | 'revenue_this_month'
  | 'revenue_last_month'
  | 'revenue_next_month'
  | 'invoice_by_customer'
  | 'payments_received'
  | 'customer_summary'
  | 'cash_flow_forecast'
  | 'business_health'
  | 'natural_response';

export interface BusinessQueryResult {
  query_type: BusinessQueryType;
  params: Record<string, unknown>;
  answer?: string;
  data?: unknown;
}

/**
 * Resolve natural language to query intent, then execute safe server-side queries.
 * AI never writes to DB or runs raw SQL.
 */
export async function resolveBusinessQuery(
  question: string,
  supabase: SupabaseClient,
  businessId: string,
  financialWindow?: DashboardFinancialRange | null
): Promise<BusinessQueryResult> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: BUSINESS_QUERY_SYSTEM },
      {
        role: 'user',
        content: businessQueryUser(
          question,
          financialWindow ? { label: financialWindow.label, preset: financialWindow.preset } : null
        ),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty AI response');

  let parsed: { query_type: string; params?: Record<string, unknown>; answer?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON from AI');
  }

  const queryType = parsed.query_type as BusinessQueryType;
  const params = parsed.params ?? {};
  const result: BusinessQueryResult = {
    query_type: queryType,
    params,
    answer: parsed.answer,
  };

  if (queryType === 'natural_response') {
    return result;
  }

  // Execute type-safe server-side queries
  switch (queryType) {
    case 'overdue_invoices': {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer_name, total, due_date')
        .eq('business_id', businessId)
        .eq('status', 'overdue')
        .order('due_date', { ascending: true });
      result.data = data;
      break;
    }
    case 'outstanding_invoices': {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer_name, total, due_date, status')
        .eq('business_id', businessId)
        .in('status', ['sent', 'viewed'])
        .order('due_date', { ascending: true });
      result.data = data;
      break;
    }
    case 'revenue_this_month':
    case 'revenue_last_month': {
      let startIso: string;
      let endIso: string;
      if (financialWindow) {
        startIso = financialWindow.startIso;
        endIso = financialWindow.endIso;
      } else {
        const now = new Date();
        const start =
          queryType === 'revenue_this_month'
            ? new Date(now.getFullYear(), now.getMonth(), 1)
            : new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end =
          queryType === 'revenue_this_month'
            ? new Date()
            : new Date(now.getFullYear(), now.getMonth(), 0);
        startIso = start.toISOString();
        endIso = end.toISOString();
      }
      const { data } = await supabase
        .from('payments')
        .select('amount, amount_in_base')
        .eq('business_id', businessId)
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      const total = (data ?? []).reduce((s, p) => {
        const row = p as { amount?: number; amount_in_base?: number | null };
        const a =
          row.amount_in_base != null && !Number.isNaN(Number(row.amount_in_base))
            ? Number(row.amount_in_base)
            : Number(row.amount ?? 0);
        return s + a;
      }, 0);
      result.data = {
        total,
        period: financialWindow ? `dashboard_${financialWindow.preset}` : queryType,
      };
      break;
    }
    case 'revenue_next_month': {
      const { data } = await supabase
        .from('invoices')
        .select('total, due_date')
        .eq('business_id', businessId)
        .in('status', ['sent', 'viewed'])
        .gte('due_date', new Date().toISOString().slice(0, 10));
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextStart = nextMonth.toISOString().slice(0, 7) + '-01';
      const nextEnd = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);
      const total = (data ?? [])
        .filter((i) => i.due_date >= nextStart && i.due_date <= nextEnd)
        .reduce((s, i) => s + Number(i.total), 0);
      result.data = { projected: total, period: 'next_month' };
      break;
    }
    case 'invoice_by_customer': {
      let q = supabase
        .from('invoices')
        .select('id, invoice_number, customer_name, total, status, due_date')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
      const name = params.customer_name as string | undefined;
      if (name) q = q.ilike('customer_name', `%${name}%`);
      const { data } = await q;
      result.data = data;
      break;
    }
    case 'payments_received': {
      const period = (params.period as string) ?? 'month';
      const since = new Date();
      if (period === 'week') since.setDate(since.getDate() - 7);
      else if (period === 'quarter') since.setMonth(since.getMonth() - 3);
      else since.setMonth(since.getMonth() - 1);
      const { data } = await supabase
        .from('payments')
        .select('id, amount, created_at, invoice_id')
        .eq('business_id', businessId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false });
      result.data = data;
      break;
    }
    case 'customer_summary': {
      const { data: inv } = await supabase
        .from('invoices')
        .select('customer_id, customer_name, total, status')
        .eq('business_id', businessId);
      const byCustomer: Record<string, { name: string; total: number; count: number }> = {};
      for (const i of inv ?? []) {
        const key = i.customer_id ?? i.customer_name;
        if (!byCustomer[key]) byCustomer[key] = { name: i.customer_name, total: 0, count: 0 };
        byCustomer[key].count++;
        if (i.status === 'paid') byCustomer[key].total += Number(i.total);
      }
      result.data = Object.values(byCustomer);
      break;
    }
    case 'cash_flow_forecast': {
      const months = (params.months_ahead as number) ?? 1;
      const end = new Date();
      end.setMonth(end.getMonth() + months);
      const { data } = await supabase
        .from('invoices')
        .select('total, due_date')
        .eq('business_id', businessId)
        .in('status', ['sent', 'viewed'])
        .gte('due_date', new Date().toISOString().slice(0, 10))
        .lte('due_date', end.toISOString().slice(0, 10));
      const total = (data ?? []).reduce((s, i) => s + Number(i.total), 0);
      result.data = { projected_inflow: total, months_ahead: months };
      break;
    }
    case 'business_health': {
      const [inv, pay, overdue] = await Promise.all([
        supabase.from('invoices').select('total, status, due_date').eq('business_id', businessId),
        supabase
          .from('payments')
          .select('amount')
          .eq('business_id', businessId)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from('invoices')
          .select('id')
          .eq('business_id', businessId)
          .eq('status', 'overdue'),
      ]);
      const outstanding = (inv.data ?? [])
        .filter((i) => i.status === 'sent' || i.status === 'viewed')
        .reduce((s, i) => s + Number(i.total), 0);
      const revenue30 = (pay.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
      result.data = {
        outstanding_total: outstanding,
        overdue_count: (overdue.data ?? []).length,
        revenue_last_30_days: revenue30,
      };
      break;
    }
    default:
      result.data = null;
  }

  return result;
}
