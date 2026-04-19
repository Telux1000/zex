import type { SupabaseClient } from '@supabase/supabase-js';
import { claudeJson } from '@/lib/ai/claude';

export type ActivityIntelligenceItem = {
  id: string;
  title: string;
  summary: string;
  priority: 'high' | 'medium' | 'low';
  category: 'follow_up' | 'due_soon' | 'overdue' | 'cashflow' | 'recent_event';
  suggested_action?: string | null;
  supporting_facts?: string[];
};

type ActivityContext = {
  as_of: string;
  recent_events: Array<{
    id: string;
    type: string;
    title: string;
    created_at: string;
  }>;
  due_soon: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    due_date: string;
    balance_due: number;
  }>;
  overdue: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    due_date: string;
    balance_due: number;
  }>;
  open_totals: {
    outstanding_total: number;
    expected_cash_7_days: number;
  };
};

export async function buildActivityContext(
  supabase: SupabaseClient,
  businessId: string
): Promise<ActivityContext> {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const in3 = new Date(now);
  in3.setDate(in3.getDate() + 3);
  const in7 = new Date(now);
  in7.setDate(in7.getDate() + 7);
  const in3Iso = in3.toISOString().slice(0, 10);
  const in7Iso = in7.toISOString().slice(0, 10);

  const [{ data: events }, { data: invoices }] = await Promise.all([
    supabase
      .from('activity_events')
      .select('id, type, title, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('invoices')
      .select('id, invoice_number, customer_name, due_date, status, total, amount_paid, balance_due')
      .eq('business_id', businessId),
  ]);

  const rows = (invoices ?? []).map((r) => {
    const total = Number(r.total ?? 0);
    const paid = Number(r.amount_paid ?? 0);
    const balance =
      r.balance_due != null ? Number(r.balance_due) : Math.max(0, total - paid);
    return { ...r, balance_due_safe: Math.max(0, balance) };
  });

  const open = rows.filter(
    (r) =>
      !['paid', 'voided'].includes(String(r.status ?? '')) &&
      r.balance_due_safe > 0
  );
  const dueSoon = open.filter(
    (r) => String(r.due_date) >= todayIso && String(r.due_date) <= in3Iso
  );
  const overdue = open.filter((r) => String(r.due_date) < todayIso);
  const expectedCash7 = open
    .filter((r) => String(r.due_date) >= todayIso && String(r.due_date) <= in7Iso)
    .reduce((s, r) => s + r.balance_due_safe, 0);

  return {
    as_of: new Date().toISOString(),
    recent_events: (events ?? []).map((e) => ({
      id: e.id,
      type: String(e.type ?? ''),
      title: String(e.title ?? ''),
      created_at: String(e.created_at ?? ''),
    })),
    due_soon: dueSoon.slice(0, 20).map((r) => ({
      id: r.id,
      invoice_number: String(r.invoice_number ?? ''),
      customer_name: String(r.customer_name ?? ''),
      due_date: String(r.due_date ?? ''),
      balance_due: r.balance_due_safe,
    })),
    overdue: overdue.slice(0, 20).map((r) => ({
      id: r.id,
      invoice_number: String(r.invoice_number ?? ''),
      customer_name: String(r.customer_name ?? ''),
      due_date: String(r.due_date ?? ''),
      balance_due: r.balance_due_safe,
    })),
    open_totals: {
      outstanding_total: Math.round(open.reduce((s, r) => s + r.balance_due_safe, 0) * 100) / 100,
      expected_cash_7_days: Math.round(expectedCash7 * 100) / 100,
    },
  };
}

export async function generateActivityIntelligence(
  supabase: SupabaseClient,
  businessId: string
): Promise<ActivityIntelligenceItem[]> {
  const context = await buildActivityContext(supabase, businessId);

  const system = [
    'You are an operations assistant for invoicing teams.',
    'Use ONLY the provided context JSON.',
    'Do not invent events, invoices, customers, or amounts.',
    'Return concise actionable JSON, ranked by urgency.',
  ].join(' ');

  const prompt = [
    'Create 5-10 prioritized activity items for today.',
    'Output JSON shape:',
    '{"items":[{"id":"stable-id","title":"...","summary":"...","priority":"high|medium|low","category":"follow_up|due_soon|overdue|cashflow|recent_event","suggested_action":"...","supporting_facts":["..."]}]}',
    `Context JSON:\n${JSON.stringify(context)}`,
  ].join('\n');

  const output = await claudeJson<{ items?: ActivityIntelligenceItem[] }>({
    system,
    prompt,
    maxTokens: 1500,
  });

  return (output.items ?? []).filter((i) => i?.id && i?.title && i?.summary);
}

