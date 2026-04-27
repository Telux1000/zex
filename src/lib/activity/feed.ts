import { formatCurrencyAmount } from '@/lib/utils/currency';
import { INSIGHT_THRESHOLDS } from '@/lib/insights/constants';
import { expenseAmountInBase, expenseOriginalCurrency } from '@/lib/expenses/expense-base-amount';

export type ActivityFeedItem = {
  id: string;
  eventType: string;
  title: string;
  description?: string;
  timestamp: string;
  severity?: 'neutral' | 'success' | 'warning';
  href?: string;
};

export type ActivityEventRow = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  created_at: string;
  entity_type?: string | null;
  entity_id?: string | null;
};

export type ExpenseActivityRow = {
  id: string;
  description: string;
  category?: string | null;
  amount: number | string | null;
  currency?: string | null;
  base_amount?: number | string | null;
  exchange_rate?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  expense_date?: string | null;
  attachment_url?: string | null;
};

export type PaymentActivityRow = {
  id: string;
  invoice_id?: string | null;
  amount: number | string | null;
  currency?: string | null;
  created_at?: string | null;
  status?: string | null;
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  invoice_created: 'Invoice',
  invoice_sent: 'Invoice',
  invoice_viewed: 'Invoice',
  invoice_paid: 'Invoice',
  invoice_overdue: 'Invoice',
  invoice_updated: 'Invoice',
  invoice_deleted: 'Invoice',
  customer_created: 'Customer',
  customer_added: 'Customer',
  customer_updated: 'Customer',
  customer_deleted: 'Customer',
  payment_received: 'Payment',
  payment_partial: 'Payment',
  payment_full: 'Payment',
  ai_insight_generated: 'System',
  business_updated: 'Business',
  expense_created: 'Expense',
  high_expense_created: 'Expense',
  expense_updated: 'Expense',
  expense_deleted: 'Expense',
  expense_attachment_added: 'Expense',
  quote_created: 'Quote',
  quote_sent: 'Quote',
  quote_accepted: 'Quote',
  quote_rejected: 'Quote',
  quote_expired: 'Quote',
  quote_converted: 'Quote',
};

export function buildActivityFeedItems(options: {
  events: ActivityEventRow[];
  expenses?: ExpenseActivityRow[];
  payments?: PaymentActivityRow[];
  currencyCode: string;
  limit?: number;
}): ActivityFeedItem[] {
  const limit = options.limit ?? 18;
  const currency = options.currencyCode || 'USD';
  const expenses = options.expenses ?? [];
  const payments = options.payments ?? [];
  const events = options.events ?? [];

  const fromEvents: ActivityFeedItem[] = events.map((ev) => {
    let severity: ActivityFeedItem['severity'] = 'neutral';
    if (
      ev.type === 'invoice_paid' ||
      ev.type === 'payment_received' ||
      ev.type === 'payment_partial' ||
      ev.type === 'payment_full'
    ) {
      severity = 'success';
    }
    if (
      ev.type === 'invoice_overdue' ||
      ev.type === 'high_expense_created' ||
      ev.type === 'quote_rejected' ||
      ev.type === 'quote_expired'
    ) {
      severity = 'warning';
    }
    if (ev.type === 'quote_accepted' || ev.type === 'quote_converted') severity = 'success';

    let href: string | undefined;
    if (ev.entity_type === 'invoice' && ev.entity_id) {
      href = `/dashboard/invoices/${ev.entity_id}`;
    }
    if (ev.entity_type === 'expense' && ev.entity_id) {
      href = `/dashboard/expenses`;
    }
    if (ev.entity_type === 'quote' && ev.entity_id) {
      href = `/dashboard/quotes/${ev.entity_id}`;
    }

    return {
      id: `ev-${ev.id}`,
      eventType: EVENT_TYPE_LABELS[ev.type] ?? ev.type,
      title: ev.title,
      description: ev.description ?? undefined,
      timestamp: ev.created_at,
      severity,
      href,
    };
  });

  const hasExpenseLogged = new Set(
    events
      .filter((e) => e.type.startsWith('expense_') && e.entity_id)
      .map((e) => String(e.entity_id))
  );

  const synthetic: ActivityFeedItem[] = [];
  for (const ex of expenses) {
    const id = String(ex.id || '');
    if (!id || hasExpenseLogged.has(id)) continue;
    const created = ex.created_at;
    if (!created) continue;
    const baseAmt = expenseAmountInBase(ex, currency);
    const isHigh = baseAmt >= INSIGHT_THRESHOLDS.highExpenseActivityAmount;
    const cat = String(ex.category || 'General');
    const origCur = expenseOriginalCurrency(ex, currency);
    const origFmt = formatCurrencyAmount(Math.max(0, num(ex.amount)), origCur);
    const approx =
      origCur !== currency.toUpperCase()
        ? ` (≈ ${formatCurrencyAmount(baseAmt, currency)})`
        : '';
    synthetic.push({
      id: `syn-exp-${id}`,
      eventType: 'Expense',
      title: isHigh ? 'High expense recorded' : 'Expense recorded',
      description: isHigh
        ? `${origFmt}${approx} added (${cat}) — ${ex.description?.slice(0, 80) || 'Expense'}`
        : `${origFmt}${approx} — ${ex.description?.slice(0, 80) || cat}`,
      timestamp: created,
      severity: 'neutral',
      href: '/dashboard/expenses',
    });
  }

  const hasPaymentLogged = new Set(
    events
      .filter((e) => (e.type === 'payment_received' || e.type === 'invoice_paid') && e.entity_id)
      .map((e) => String(e.entity_id))
  );
  const syntheticPayments: ActivityFeedItem[] = [];
  for (const p of payments) {
    const invoiceId = String(p.invoice_id || '');
    const created = p.created_at;
    const status = String(p.status || '').toLowerCase();
    if (
      !invoiceId ||
      !created ||
      status === 'failed' ||
      status === 'refunded' ||
      hasPaymentLogged.has(invoiceId)
    ) {
      continue;
    }
    const amt = Math.max(0, num(p.amount));
    const cur = String(p.currency || currency || 'USD').toUpperCase();
    syntheticPayments.push({
      id: `syn-pay-${String(p.id || `${invoiceId}-${created}`)}`,
      eventType: 'Payment',
      title: 'Payment received',
      description: `${formatCurrencyAmount(amt, cur)} received`,
      timestamp: created,
      severity: 'success',
      href: `/dashboard/invoices/${invoiceId}`,
    });
  }

  return [...fromEvents, ...synthetic, ...syntheticPayments]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
