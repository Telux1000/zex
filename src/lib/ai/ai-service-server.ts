import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  buildActivityContext,
  generateActivityIntelligence,
  type ActivityIntelligenceItem,
} from '@/lib/ai/activity';
import {
  generateClaudeInsights,
  askClaudeBusinessQuestion,
} from '@/lib/ai/insights';
import { generateInsights } from '@/lib/ai/insights-engine';
import { resolveBusinessQuery, type BusinessQueryResult } from '@/lib/ai/business-query';
import { extractPaymentsTimeIntent } from '@/lib/ai/extract-payments-time-intent';
import type { AiInsight } from '@/lib/database.types';
import {
  resolvePaymentsReceivedTimeRange,
  shouldTryPaymentsReceivedTimeQuestion,
} from '@/lib/analytics/payments-received-time-range';
import {
  collectedMetricFetchStartIso,
  dashboardPresetForRevenueSpec,
  loadCollectedRevenueMetricForBusiness,
} from '@/lib/payments/collected-revenue-metric';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { statusForFilter } from '@/lib/invoices/list-filters';
import type { DashboardFinancialRange } from '@/lib/dashboard/date-range';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`AI timeout (${label}) after ${ms}ms`));
    }, ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

function normalizeSupportingFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x)).filter(Boolean);
}

function isPartialPaymentQuestion(question: string): boolean {
  return /(part(ial)?\s*pay|partially\s*paid|part payment|remaining.*part payment)/i.test(question);
}

function formatBusinessQueryResultForAsk(r: BusinessQueryResult): string {
  if (typeof r.answer === 'string' && r.answer.trim()) return r.answer.trim();
  switch (r.query_type) {
    case 'revenue_this_month':
    case 'revenue_last_month': {
      const x = r.data as { total?: number; period?: string } | undefined;
      if (x && typeof x.total === 'number') {
        return `Total received in the selected period: ${x.total.toFixed(2)} (business base currency). Period key: ${String(x.period ?? '')}.`;
      }
      return 'No payments matched that period.';
    }
    case 'payments_received': {
      const rows = r.data as Array<{ amount?: number }> | undefined;
      if (Array.isArray(rows)) {
        const t = rows.reduce((s, p) => s + Number(p.amount ?? 0), 0);
        return `${rows.length} payment(s) in the lookback window; sum of stored amounts: ${t.toFixed(2)}.`;
      }
      return 'No payments in that window.';
    }
    case 'overdue_invoices': {
      const rows = r.data as unknown[] | undefined;
      return Array.isArray(rows)
        ? `${rows.length} overdue invoice(s). Open Invoices for details.`
        : 'No overdue invoice list available.';
    }
    case 'outstanding_invoices': {
      const rows = r.data as unknown[] | undefined;
      return Array.isArray(rows)
        ? `${rows.length} outstanding invoice(s). Open Invoices for details.`
        : 'No outstanding invoice list available.';
    }
    default:
      return 'Here is the result of your query. Open the dashboard for full detail.';
  }
}

async function tryAnswerPaymentsReceivedTimeQuestion(
  supabase: SupabaseClient,
  businessId: string,
  question: string,
  workspaceTimezone: string | null | undefined
): Promise<{ answer: string; supporting_facts: string[] } | null> {
  if (!shouldTryPaymentsReceivedTimeQuestion(question)) return null;

  let intent;
  try {
    intent = await extractPaymentsTimeIntent(question);
  } catch {
    return null;
  }

  if (intent.status === 'not_applicable') return null;
  if (intent.status === 'ambiguous') {
    return { answer: intent.note, supporting_facts: [] };
  }

  const now = new Date();
  const resolved = resolvePaymentsReceivedTimeRange(intent.range, now, workspaceTimezone);
  if (!resolved.ok) {
    return { answer: resolved.error, supporting_facts: [] };
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('currency')
    .eq('id', businessId)
    .maybeSingle();
  const currency = String((biz as { currency?: string } | null)?.currency ?? 'USD').trim() || 'USD';

  const metricResult = await loadCollectedRevenueMetricForBusiness(supabase, businessId, currency, {
    fetchStartIso: collectedMetricFetchStartIso(intent.range, workspaceTimezone, now),
    paymentsWindow: resolved.value,
    surface: 'ai_payments_question',
    timezone: workspaceTimezone,
    dashboardPreset: dashboardPresetForRevenueSpec(intent.range),
  });

  if ('error' in metricResult) {
    return {
      answer: `Could not load collected revenue: ${metricResult.error}`,
      supporting_facts: [],
    };
  }

  const total = metricResult.totalBase;
  const ledgerCount = metricResult.debug.ledgerRowCount;
  const supplementCount = metricResult.debug.supplementCount;
  const amountStr = formatCurrencyAmount(total, currency);

  const countParts: string[] = [];
  if (ledgerCount > 0) countParts.push(`${ledgerCount} ledger payment${ledgerCount === 1 ? '' : 's'}`);
  if (supplementCount > 0) {
    countParts.push(
      `${supplementCount} invoice-level collection${supplementCount === 1 ? '' : 's'} (no separate payment row in this window)`
    );
  }
  const countLabel =
    countParts.length > 0 ? countParts.join('; ') : 'no matching collections in this window';

  return {
    answer: `${amountStr} was received in the resolved window (${countLabel}). Range: ${resolved.value.humanRange}.`,
    supporting_facts: [
      `Resolved range: ${resolved.value.humanRange}`,
      `Metric: collected cash (ledger + invoice-level, base ${currency}), same logic as dashboard`,
      `Ledger payments in window: ${ledgerCount}`,
      `Invoice supplements in window: ${supplementCount}`,
    ],
  };
}

function formatDueDate(value: string | null | undefined): string {
  if (!value) return 'No due date';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

async function buildPartialPaymentAnswer(
  supabase: SupabaseClient,
  businessId: string
): Promise<{ answer: string; supporting_facts: string[] }> {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, customer_name, status, total, amount_paid, balance_due, due_date')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  const normalized = (invoices ?? []).map((inv) => {
    const total = Number(inv.total ?? 0);
    const amountPaid = Number(inv.amount_paid ?? 0);
    const balanceDue =
      inv.balance_due != null ? Number(inv.balance_due) : Math.max(0, total - amountPaid);
    const derived = deriveInvoiceStatus({
      status: inv.status,
      total,
      amount_paid: amountPaid,
      balance_due: balanceDue,
    });
    const display = statusForFilter({
      due_date: String(inv.due_date ?? ''),
      status: derived,
    });
    return {
      id: String(inv.id),
      invoice_number: String(inv.invoice_number ?? ''),
      customer_name: String(inv.customer_name ?? 'Unknown customer'),
      total,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      status: display,
    };
  });

  const partiallyPaid = normalized.filter((inv) => inv.status === 'partially_paid');
  if (partiallyPaid.length === 0) {
    return {
      answer: 'No partially paid invoices were found in your current invoice and payment data.',
      supporting_facts: [],
    };
  }

  const ids = partiallyPaid.map((i) => i.id);
  const { data: scheduleRows } = await supabase
    .from('invoice_payment_schedule_items')
    .select('invoice_id, description, amount, due_date, status')
    .in('invoice_id', ids)
    .eq('status', 'pending')
    .order('due_date', { ascending: true });

  const schedulesByInvoice = new Map<
    string,
    Array<{ description: string; amount: number; due_date: string; status: string }>
  >();
  for (const row of scheduleRows ?? []) {
    const invoiceId = String((row as { invoice_id?: string | null }).invoice_id ?? '');
    if (!invoiceId) continue;
    const list = schedulesByInvoice.get(invoiceId) ?? [];
    list.push({
      description: String((row as { description?: string }).description ?? 'Payment'),
      amount: Number((row as { amount?: number }).amount ?? 0),
      due_date: String((row as { due_date?: string }).due_date ?? ''),
      status: String((row as { status?: string }).status ?? 'pending'),
    });
    schedulesByInvoice.set(invoiceId, list);
  }

  const lines: string[] = [
    `Yes. You have ${partiallyPaid.length} partially paid invoice${partiallyPaid.length > 1 ? 's' : ''}:`,
  ];
  const facts: string[] = [];

  for (const inv of partiallyPaid.slice(0, 8)) {
    lines.push(
      `- ${inv.invoice_number} — ${inv.customer_name}`,
      `  - Total: ${inv.total.toFixed(2)}`,
      `  - Paid: ${inv.amount_paid.toFixed(2)}`,
      `  - Balance due: ${inv.balance_due.toFixed(2)}`
    );

    const unpaidRows = schedulesByInvoice.get(inv.id) ?? [];
    if (unpaidRows.length > 0) {
      lines.push('  - Remaining scheduled payments:');
      for (const row of unpaidRows.slice(0, 6)) {
        const detail = `    - ${row.description} — ${row.amount.toFixed(2)} due ${formatDueDate(row.due_date)} (${row.status})`;
        lines.push(detail);
        facts.push(`${inv.invoice_number}: ${row.description} ${row.amount.toFixed(2)} due ${formatDueDate(row.due_date)}`);
      }
    }

    facts.push(
      `${inv.invoice_number}: paid ${inv.amount_paid.toFixed(2)}, balance ${inv.balance_due.toFixed(2)}`
    );
  }

  return {
    answer: lines.join('\n'),
    supporting_facts: facts.slice(0, 20),
  };
}

function normalizeInsightForClient(insight: AiInsight): Record<string, unknown> {
  const metadata = insight.metadata as unknown;
  const metaObj =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};

  const supportingFacts = normalizeSupportingFacts((metaObj as { supporting_facts?: unknown[] }).supporting_facts);

  return {
    ...insight,
    // Keep UI-compatible fields stable regardless of which provider wrote the record.
    suggested_action: insight.action_label ?? null,
    metadata: {
      ...metaObj,
      supporting_facts: supportingFacts,
    },
  };
}

export async function generateInsightsWithFallback(
  supabase: SupabaseClient,
  businessId: string,
  financialWindow?: DashboardFinancialRange | null
): Promise<{ insights: Array<Record<string, unknown>> }> {
  const timeoutMs = 45_000;

  try {
    const insights = await withTimeout(
      generateClaudeInsights(supabase, businessId, financialWindow),
      timeoutMs,
      'Claude insights'
    );
    console.info('[AI][Insights] Handled by Claude');
    return { insights: insights.map(normalizeInsightForClient) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[AI][Insights] Claude failed; falling back to OpenAI', msg);
  }

  try {
    const insights = await withTimeout(
      generateInsights(supabase, businessId, financialWindow),
      timeoutMs,
      'OpenAI insights'
    );
    console.info('[AI][Insights] Handled by OpenAI (fallback)');
    return { insights: insights.map(normalizeInsightForClient) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AI][Insights] OpenAI fallback also failed', msg);
    throw err;
  }
}

export async function askInsightsQuestionWithFallback(
  supabase: SupabaseClient,
  businessId: string,
  question: string,
  financialWindow?: DashboardFinancialRange | null,
  workspaceTimezone?: string | null
): Promise<{ answer: string; supporting_facts: string[] }> {
  const timeoutMs = 35_000;

  try {
    const paymentsTime = await withTimeout(
      tryAnswerPaymentsReceivedTimeQuestion(supabase, businessId, question, workspaceTimezone),
      18_000,
      'payments time intent'
    );
    if (paymentsTime) {
      console.info('[AI][Insights Ask] Deterministic payments-in-range answer used');
      return paymentsTime;
    }
  } catch {
    /* fall through to other handlers */
  }

  if (isPartialPaymentQuestion(question)) {
    console.info('[AI][Insights Ask] Deterministic partial-payment answer used');
    return buildPartialPaymentAnswer(supabase, businessId);
  }

  try {
    const result = await withTimeout(
      askClaudeBusinessQuestion(supabase, businessId, question, financialWindow),
      timeoutMs,
      'Claude ask'
    );
    console.info('[AI][Insights Ask] Handled by Claude');
    return {
      answer: typeof result.answer === 'string' ? result.answer : '',
      supporting_facts: normalizeSupportingFacts(result.supporting_facts),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[AI][Insights Ask] Claude failed; falling back to OpenAI', msg);
  }

  const openaiResult = await withTimeout(
    resolveBusinessQuery(question, supabase, businessId, financialWindow),
    timeoutMs,
    'OpenAI ask'
  );

  console.info('[AI][Insights Ask] Handled by OpenAI (fallback)');
  return {
    answer: formatBusinessQueryResultForAsk(openaiResult),
    supporting_facts: [],
  };
}

async function generateActivityIntelligenceOpenAI(
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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const completion = await withTimeout(
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
    45_000,
    'OpenAI activity'
  );

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI activity returned empty response');

  let parsed: { items?: ActivityIntelligenceItem[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON returned from OpenAI activity');
  }

  return (parsed.items ?? []).filter((i) => i?.id && i?.title && i?.summary);
}

export async function generateActivityIntelligenceForToday(
  supabase: SupabaseClient,
  businessId: string
) {
  const timeoutMs = 45_000;

  try {
    const items = await withTimeout(
      generateActivityIntelligence(supabase, businessId),
      timeoutMs,
      'Claude activity'
    );
    console.info('[AI][Activity] Handled by Claude');
    // Normalize to a consistent shape for the UI regardless of provider.
    return items.map((i) => ({
      ...i,
      suggested_action: i.suggested_action ?? null,
      supporting_facts: Array.isArray(i.supporting_facts) ? i.supporting_facts : [],
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[AI][Activity] Claude failed; falling back to OpenAI', msg);
  }

  try {
    const items = await generateActivityIntelligenceOpenAI(supabase, businessId);
    console.info('[AI][Activity] Handled by OpenAI (fallback)');
    // Ensure a stable array of items with consistent key types.
    return items.map((i) => ({
      ...i,
      suggested_action: i.suggested_action ?? null,
      supporting_facts: Array.isArray(i.supporting_facts) ? i.supporting_facts : [],
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AI][Activity] OpenAI fallback also failed', msg);
    throw err;
  }
}

