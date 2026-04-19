import { formatCurrencyAmount } from '@/lib/utils/currency';
import { INSIGHT_THRESHOLDS } from '@/lib/insights/constants';
import type { FinancialInsight } from '@/lib/insights/generate';

export type QuoteRowForInsights = {
  id: string;
  quote_number: string;
  status: string;
  total: number | string | null;
  currency?: string | null;
  expiry_date?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  converted_invoice_id?: string | null;
};

const STALE_DAYS = 3;

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function generateQuoteInsights(input: {
  quotes: QuoteRowForInsights[];
  baseCurrencyCode: string;
  quotesHref?: string;
  now?: Date;
  staleDays?: number;
  highValueThreshold?: number;
}): FinancialInsight[] {
  const now = input.now ?? new Date();
  const base = (input.baseCurrencyCode || 'USD').toUpperCase();
  const staleDays = input.staleDays ?? STALE_DAYS;
  const highTh = input.highValueThreshold ?? INSIGHT_THRESHOLDS.highExpenseActivityAmount;
  const listHref = input.quotesHref ?? '/dashboard/quotes';
  const quotes = input.quotes ?? [];

  const sent = quotes.filter((q) => String(q.status || '').toLowerCase() === 'sent');
  const acceptedOpen = quotes.filter(
    (q) =>
      String(q.status || '').toLowerCase() === 'accepted' &&
      !(q.converted_invoice_id && String(q.converted_invoice_id).trim())
  );

  const insights: FinancialInsight[] = [];

  if (sent.length > 0) {
    let totalSameBase = 0;
    let mixedCurrency = false;
    for (const q of sent) {
      const cur = String(q.currency ?? base).toUpperCase();
      if (cur !== base) {
        mixedCurrency = true;
        break;
      }
      totalSameBase += num(q.total);
    }
    if (!mixedCurrency && totalSameBase > 0) {
      insights.push({
        id: 'quote-pending-value',
        type: 'opportunity',
        title: 'Pending quotes',
        message: `You have ${sent.length} pending quote${sent.length === 1 ? '' : 's'} worth ${formatCurrencyAmount(totalSameBase, base)}. Follow up to increase conversion.`,
        priority: 4,
        actionLabel: 'View quotes',
        actionHref: listHref,
      });
    } else if (sent.length > 0) {
      insights.push({
        id: 'quote-pending-count',
        type: 'opportunity',
        title: 'Pending quotes',
        message: `You have ${sent.length} pending quote${sent.length === 1 ? '' : 's'}. Follow up to increase conversion.`,
        priority: 4,
        actionLabel: 'View quotes',
        actionHref: listHref,
      });
    }
  }

  let highPending: QuoteRowForInsights | null = null;
  for (const q of sent) {
    const cur = String(q.currency ?? base).toUpperCase();
    const t = num(q.total);
    if (cur === base && t >= highTh && (!highPending || t > num(highPending.total))) {
      highPending = q;
    }
  }
  if (highPending) {
    insights.push({
      id: 'quote-high-value-pending',
      type: 'warning',
      title: 'High-value quote pending',
      message: `A high-value quote of ${formatCurrencyAmount(num(highPending.total), base)} is still pending. This could significantly impact your revenue.`,
      priority: 2,
      actionLabel: 'Open quote',
      actionHref: `/dashboard/quotes/${highPending.id}`,
    });
  }

  let staleCount = 0;
  const nowMs = now.getTime();
  for (const q of sent) {
    const raw = q.updated_at || q.created_at;
    if (!raw) continue;
    const u = new Date(String(raw));
    if (!Number.isFinite(u.getTime())) continue;
    const ageDays = (nowMs - u.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays >= staleDays) staleCount += 1;
  }
  if (staleCount > 0) {
    insights.push({
      id: 'quote-stale-sent',
      type: 'info',
      title: 'Quotes awaiting response',
      message:
        staleCount === 1
          ? `1 quote has not been responded to in ${staleDays} days. Consider following up.`
          : `${staleCount} quotes have not been responded to in ${staleDays} days. Consider following up.`,
      priority: 5,
      actionLabel: 'Review quotes',
      actionHref: listHref,
    });
  }

  if (acceptedOpen.length > 0) {
    insights.push({
      id: 'quote-convert-opportunity',
      type: 'opportunity',
      title: 'Convert accepted quotes',
      message: `You have ${acceptedOpen.length} accepted quote${acceptedOpen.length === 1 ? '' : 's'} ready to convert into invoices.`,
      priority: 3,
      actionLabel: 'View quotes',
      actionHref: listHref,
    });
  }

  return insights;
}
