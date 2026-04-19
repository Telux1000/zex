import { addDays, differenceInCalendarDays, isBefore, parseISO, startOfDay } from 'date-fns';
import type { NotificationCandidate, NotificationCategory, NotificationModel, NotificationSeverity } from './types';

type InvoiceRowForNotification = {
  id: string;
  invoice_number: string;
  customer_name: string;
  due_date: string;
  status: string | null;
  total: number | null;
  balance_due: number | null;
  amount_paid?: number | null;
  exchange_rate_to_base?: number | null;
  total_in_base?: number | null;
  created_at?: string | null;
};

type QuoteRowForNotification = {
  id: string;
  quote_number: string;
  customer_snapshot: { name?: string | null } | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: string | null;
  total: number | null;
  currency: string | null;
  converted_invoice_id?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
};

type ExpenseRowForNotification = {
  id: string;
  expense_date: string;
  category: string | null;
  amount: number | null;
};

type PaymentRowForNotification = {
  id: string;
  created_at: string | null;
  status: string | null;
  amount_in_base?: number | null;
  amount?: number | null;
};

export type NotificationEngineInput = {
  baseCurrencyCode: string;
  nowIso: string;
  invoices: InvoiceRowForNotification[];
  quotes: QuoteRowForNotification[];
  expenses: ExpenseRowForNotification[];
  payments: PaymentRowForNotification[];
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function quantizeAmount(amount: number, step: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.max(0, Math.round(amount / step));
}

function ageBucketDays(ageDays: number): 'lt15' | '15_30' | '31_60' | 'gt60' {
  if (ageDays < 15) return 'lt15';
  if (ageDays < 31) return '15_30';
  if (ageDays < 61) return '31_60';
  return 'gt60';
}

function quantizeCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(10, Math.max(1, Math.round(count)));
}

function isInvoiceInTerminalStatus(status: string | null | undefined): boolean {
  const st = String(status ?? '').toLowerCase();
  return st === 'paid' || st === 'voided' || st === 'cancelled';
}

function currencyAmountLabel(amount: number): string {
  // Avoid locale/currency formatting complexity on server; panel shows raw numeric with context.
  return Math.round(amount).toLocaleString();
}

function shouldKeepCandidate({
  isHighOrMedium,
  hasHighOrMediumAny,
}: {
  isHighOrMedium: boolean;
  hasHighOrMediumAny: boolean;
}): boolean {
  // Suppress low-noise info notifications when the panel already has more urgent items.
  if (hasHighOrMediumAny) return isHighOrMedium;
  return true;
}

function pushCandidate(
  list: NotificationCandidate[],
  candidate: NotificationCandidate,
  maxTotal: number
) {
  list.push(candidate);
  list.sort((a, b) => b.priorityScore - a.priorityScore);
  if (list.length > maxTotal) list.length = maxTotal;
}

export function generateNotificationCandidates(input: NotificationEngineInput): NotificationCandidate[] {
  const now = new Date(input.nowIso);
  const today = startOfDay(now);
  const nowIso = input.nowIso;

  const invoices = input.invoices ?? [];
  const quotes = input.quotes ?? [];
  const expenses = input.expenses ?? [];
  const payments = input.payments ?? [];

  const MIN_OVERDUE_TOTAL = 250;
  const MIN_PAYMENT_NOTIF = 500;
  const HIGH_VALUE_QUOTE = 2500;
  const STALE_ISSUE_DAYS = 14;
  const EXPIRY_SOON_DAYS = 7;
  const THIRTY_DAYS_AGO = addDays(today, -30);
  const FOURTEEN_DAYS_AGO = addDays(today, -14);
  const TWO_DAYS_AGO = addDays(today, -2);

  const overdueInvoices = invoices.filter((inv) => {
    const dueDateRaw = inv.due_date ? parseISO(inv.due_date) : null;
    if (!dueDateRaw) return false;
    if (isInvoiceInTerminalStatus(inv.status)) return false;
    const balanceDue = Math.max(0, num(inv.balance_due));
    if (balanceDue <= 0.0001) return false;
    return isBefore(dueDateRaw, today);
  });

  const overdueMetrics = overdueInvoices
    .map((inv) => {
      const dueDate = parseISO(inv.due_date);
      const ageDays = Math.max(0, differenceInCalendarDays(today, startOfDay(dueDate)));
      const rate = num(inv.exchange_rate_to_base);
      const balanceDueBase = num(inv.balance_due) * (rate > 0 ? rate : 1);
      return { inv, ageDays, balanceDueBase };
    })
    .sort((a, b) => b.ageDays - a.ageDays);

  const overdueCount = overdueMetrics.length;
  const overdueTotalBase = overdueMetrics.reduce((s, x) => s + x.balanceDueBase, 0);
  const overdueMaxAge = overdueMetrics[0]?.ageDays ?? 0;
  const overdueAgeBucket = ageBucketDays(overdueMaxAge);
  const overdueCountBucket = quantizeCount(overdueCount);
  const overdueAmountBucket = quantizeAmount(overdueTotalBase, 500);

  const acceptedPendingQuotes = quotes.filter((q) => {
    const st = String(q.status ?? '').toLowerCase();
    const convertedId = (q.converted_invoice_id ?? null) as string | null;
    return st === 'accepted' && !convertedId;
  });

  const acceptedPendingMetrics = acceptedPendingQuotes
    .map((q) => {
      const acceptedAt = q.accepted_at ? parseISO(q.accepted_at) : null;
      const ageDays = acceptedAt ? Math.max(0, differenceInCalendarDays(today, startOfDay(acceptedAt))) : 0;
      const totalBase = num(q.total);
      return { q, ageDays, totalBase };
    })
    .sort((a, b) => b.totalBase - a.totalBase);

  const acceptedCount = acceptedPendingMetrics.length;
  const acceptedTotal = acceptedPendingMetrics.reduce((s, x) => s + x.totalBase, 0);
  const acceptedMaxAge = acceptedPendingMetrics.reduce((m, x) => Math.max(m, x.ageDays), 0);
  const acceptedAgeBucket = ageBucketDays(acceptedMaxAge);
  const acceptedCountBucket = quantizeCount(acceptedCount);
  const acceptedAmountBucket = quantizeAmount(acceptedTotal, 500);

  const pendingQuotes = quotes.filter((q) => {
    const st = String(q.status ?? '').toLowerCase();
    const convertedId = (q.converted_invoice_id ?? null) as string | null;
    if (convertedId) return false;
    if (st !== 'draft' && st !== 'sent') return false;
    const expiry = q.expiry_date ? parseISO(q.expiry_date) : null;
    if (expiry && !Number.isNaN(expiry.getTime()) && isBefore(expiry, today)) return false; // expired quotes are handled elsewhere
    return true;
  });

  const pendingHighValue = pendingQuotes.filter((q) => num(q.total) >= HIGH_VALUE_QUOTE);
  const pendingHighValueMetrics = pendingHighValue
    .map((q) => ({ q, totalBase: num(q.total) }))
    .sort((a, b) => b.totalBase - a.totalBase);
  const pendingHighValueCount = pendingHighValueMetrics.length;
  const pendingHighValueTotal = pendingHighValueMetrics.reduce((s, x) => s + x.totalBase, 0);

  const pendingHighValueBucket = quantizeAmount(pendingHighValueTotal, 1000);
  const pendingHighValueTop = pendingHighValueMetrics[0]?.q ?? null;

  const staleQuotes = pendingQuotes.filter((q) => {
    const issueDate = q.issue_date ? parseISO(q.issue_date) : null;
    const expiryDate = q.expiry_date ? parseISO(q.expiry_date) : null;
    const expiringSoon =
      expiryDate &&
      !Number.isNaN(expiryDate.getTime()) &&
      !isBefore(expiryDate, today) &&
      !isBefore(addDays(today, EXPIRY_SOON_DAYS), expiryDate);
    const issueStale = !!issueDate && isBefore(issueDate, FOURTEEN_DAYS_AGO);
    return expiringSoon || issueStale;
  });

  const staleCount = staleQuotes.length;
  const staleCountBucket = quantizeCount(staleCount);
  const staleTopExpiry = staleQuotes
    .map((q) => (q.expiry_date ? parseISO(q.expiry_date) : null))
    .filter((d): d is Date => Boolean(d && !Number.isNaN(d.getTime())))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const staleExpiryAgeDays = staleTopExpiry ? Math.max(0, differenceInCalendarDays(today, staleTopExpiry)) : 0;
  const staleExpiryBucket = ageBucketDays(Math.max(0, 0 - staleExpiryAgeDays));

  const outstandingOpenInvoices = invoices
    .filter((inv) => {
      if (isInvoiceInTerminalStatus(inv.status)) return false;
      const bal = Math.max(0, num(inv.balance_due));
      if (bal <= 0.0001) return false;
      return true;
    })
    .map((inv) => {
      const rate = num(inv.exchange_rate_to_base);
      const baseBalanceDue = num(inv.balance_due) * (rate > 0 ? rate : 1);
      return { inv, baseBalanceDue };
    });

  const outstandingOpenBase = outstandingOpenInvoices.reduce((s, x) => s + x.baseBalanceDue, 0);

  const expensesThis30Days = expenses.filter((e) => {
    const t = parseISO(e.expense_date).getTime();
    return Number.isFinite(t) && t >= THIRTY_DAYS_AGO.getTime();
  });

  const expensesMonthBase = expensesThis30Days.reduce((s, e) => s + Math.max(0, num(e.amount)), 0);

  const paymentsThis30Days = payments.filter((p) => {
    const t = p.created_at ? new Date(p.created_at).getTime() : null;
    if (!t || !Number.isFinite(t)) return false;
    if (t < THIRTY_DAYS_AGO.getTime()) return false;
    const st = String(p.status ?? '').toLowerCase();
    // Only count successful payments
    if (st && !['succeeded', 'success', 'paid'].includes(st)) return false;
    return true;
  });

  const collectedMonthBase = paymentsThis30Days.reduce((s, p) => {
    const amtBase = p.amount_in_base != null ? num(p.amount_in_base) : p.amount != null ? num(p.amount) : 0;
    return s + Math.max(0, amtBase);
  }, 0);

  // Revenue proxy: sum of invoice totals created in the last 30 days.
  const revenueInvoices = invoices.filter((inv) => {
    const t = inv.created_at ? new Date(inv.created_at).getTime() : null;
    if (!t || !Number.isFinite(t)) return false;
    return t >= THIRTY_DAYS_AGO.getTime();
  });

  const revenueMonthBase = revenueInvoices.reduce((s, inv) => {
    const total = num(inv.total);
    const rate = num(inv.exchange_rate_to_base);
    const baseTotal = inv.total_in_base != null && num(inv.total_in_base) > 0 ? num(inv.total_in_base) : total * (rate > 0 ? rate : 1);
    return s + Math.max(0, baseTotal);
  }, 0);

  const hasOverdue = overdueCount > 0 && overdueTotalBase >= MIN_OVERDUE_TOTAL;
  const hasAcceptedPending = acceptedCount > 0;
  const hasCollectionsRisk = outstandingOpenBase > 0 && expensesMonthBase > 0;

  const candidates: NotificationCandidate[] = [];

  if (hasOverdue) {
    const actionTarget = `/dashboard/invoices?status=overdue`;
    const severity: NotificationSeverity =
      overdueTotalBase >= 8000 || overdueMaxAge >= 45 ? 'high' : overdueTotalBase >= 1500 ? 'medium' : 'low';
    const category: NotificationCategory = severity === 'high' ? 'urgent' : 'action_needed';
    const priorityScore =
      1000 + quantizeAmount(overdueTotalBase, 100) * 2 + overdueMaxAge * (severity === 'high' ? 6 : 4);

    const title = overdueCount === 1 ? '1 invoice is overdue' : `${overdueCount} invoices are overdue`;
    const topCustomer = overdueMetrics[0]?.inv.customer_name;
    const description =
      overdueCount > 1
        ? `Overdue invoices are slowing collections. Follow up now. Total outstanding: ${currencyAmountLabel(overdueTotalBase)}.`
        : `Invoice is overdue${topCustomer ? ` for ${topCustomer}` : ''}. Follow up now. Outstanding: ${currencyAmountLabel(overdueTotalBase)}.`;

    pushCandidate(candidates, {
      type: 'overdue_invoices',
      category,
      title,
      description,
      severity,
      priorityScore,
      actionLabel: 'Send reminders',
      actionTarget,
      createdAt: nowIso,
      groupKey: `overdue_invoices:${overdueCountBucket}:${overdueAmountBucket}:${overdueAgeBucket}`,
      metadata: {
        overdueCount,
        overdueTotalBase,
        overdueMaxAge,
      },
    }, 8);
  }

  if (hasAcceptedPending) {
    const topQuote = acceptedPendingMetrics[0]?.q ?? null;
    const actionTarget = topQuote ? `/dashboard/quotes/${topQuote.id}` : `/dashboard/quotes`;
    const severity: NotificationSeverity =
      acceptedTotal >= 8000 || acceptedMaxAge >= 30 ? 'high' : acceptedTotal >= 1500 ? 'medium' : 'low';
    const category: NotificationCategory = severity === 'high' ? 'urgent' : 'action_needed';
    const priorityScore =
      900 + quantizeAmount(acceptedTotal, 100) * 2 + acceptedMaxAge * (severity === 'high' ? 6 : 4);

    const title =
      acceptedCount === 1 ? 'An accepted quote is ready to invoice' : `${acceptedCount} accepted quotes are ready to invoice`;
    const description =
      acceptedCount > 1
        ? `Converting these accepted quotes will help you collect faster. Pending for conversion: ${currencyAmountLabel(acceptedTotal)}.`
        : `This accepted quote is waiting for conversion. Converting it helps speed up cash flow. Total: ${currencyAmountLabel(acceptedTotal)}.`;

    pushCandidate(candidates, {
      type: 'accepted_quote_pending_conversion',
      category,
      title,
      description,
      severity,
      priorityScore,
      actionLabel: 'Convert to invoice',
      actionTarget,
      createdAt: nowIso,
      groupKey: `accepted_quote_pending:${acceptedCountBucket}:${acceptedAmountBucket}:${acceptedAgeBucket}`,
      metadata: {
        acceptedCount,
        acceptedTotal,
        acceptedMaxAge,
        topQuoteId: topQuote?.id ?? null,
      },
    }, 8);
  }

  if (pendingHighValueCount > 0) {
    const top = pendingHighValueTop;
    const actionTarget = top ? `/dashboard/quotes/${top.id}` : `/dashboard/quotes`;
    const severity: NotificationSeverity = pendingHighValueTotal >= 8000 ? 'high' : 'medium';
    const category: NotificationCategory = severity === 'high' ? 'urgent' : 'opportunity';
    const priorityScore = 650 + quantizeAmount(pendingHighValueTotal, 100) * 2;

    const title = pendingHighValueCount === 1 ? 'A high-value quote is still pending' : `${pendingHighValueCount} high-value quotes are still pending`;
    const description =
      top && pendingHighValueCount === 1
        ? `Follow up on this quote to move it forward. Amount: ${currencyAmountLabel(num(top.total))}.`
        : `High-value quotes need follow-up to reduce time-to-cash. Total: ${currencyAmountLabel(pendingHighValueTotal)}.`;

    pushCandidate(candidates, {
      type: 'high_value_pending_quotes',
      category,
      title,
      description,
      severity,
      priorityScore,
      actionLabel: 'Review quotes',
      actionTarget,
      createdAt: nowIso,
      groupKey: `high_value_pending:${pendingHighValueCount}:${pendingHighValueBucket}`,
      metadata: {
        pendingHighValueCount,
        pendingHighValueTotal,
        topQuoteId: top?.id ?? null,
      },
    }, 8);
  }

  // Collections risk + expenses pressure
  if (hasCollectionsRisk) {
    const collectionsCoverageRatio = expensesMonthBase > 0 ? collectedMonthBase / expensesMonthBase : 0;
    const outstandingPressureRatio = collectedMonthBase > 0 ? outstandingOpenBase / collectedMonthBase : 0;
    const expenseToRevenueRatio = revenueMonthBase > 0 ? expensesMonthBase / revenueMonthBase : 0;

    const urgentCollections =
      collectedMonthBase < expensesMonthBase * 0.85 && outstandingOpenBase > expensesMonthBase * 0.85;
    const urgentExpenseToRevenue = expenseToRevenueRatio >= 1.05 && outstandingOpenBase > collectedMonthBase;

    if (urgentCollections || urgentExpenseToRevenue) {
      const severity: NotificationSeverity = urgentCollections ? 'high' : 'medium';
      const category: NotificationCategory = severity === 'high' ? 'urgent' : 'action_needed';

      const priorityScore = 800 + Math.round((Math.max(0, 1.1 - collectionsCoverageRatio) + Math.max(0, outstandingPressureRatio - 1)) * 200);
      const actionTarget = `/dashboard/invoices?filter=${'open'}`;

      const title = 'Collections may not cover expenses';
      const description =
        urgentCollections
          ? 'Current collections are lagging behind expenses. Review outstanding invoices to protect cash flow.'
          : 'Expenses are running ahead of invoiced revenue. Review both expenses and outstanding invoices.';

      pushCandidate(candidates, {
        type: 'collections_risk',
        category,
        title,
        description,
        severity,
        priorityScore,
        actionLabel: 'Review outstanding invoices',
        actionTarget,
        createdAt: nowIso,
        groupKey: `collections_risk:${quantizeCount(Math.round(outstandingOpenBase))}:${quantizeAmount(expensesMonthBase, 500)}`,
        metadata: {
          collectedMonthBase,
          expensesMonthBase,
          revenueMonthBase,
          outstandingOpenBase,
        },
      }, 8);
    }
  }

  // Expense spike by category (month vs previous 30 days)
  if (expenses.length > 0) {
    const prevExpensesWindowStart = addDays(today, -60);
    const prevExpensesWindowEnd = addDays(today, -30);

    const prevExpenses = expenses.filter((e) => {
      const t = parseISO(e.expense_date).getTime();
      return Number.isFinite(t) && t >= prevExpensesWindowStart.getTime() && t < prevExpensesWindowEnd.getTime();
    });
    const curExpenses = expensesThis30Days;

    const toCategoryMap = (rows: ExpenseRowForNotification[]) => {
      const m: Record<string, number> = {};
      for (const e of rows) {
        const cat = String(e.category ?? 'General').trim() || 'General';
        m[cat] = (m[cat] ?? 0) + Math.max(0, num(e.amount));
      }
      return m;
    };

    const prevMap = toCategoryMap(prevExpenses);
    const curMap = toCategoryMap(curExpenses);

    const categories = Array.from(new Set([...Object.keys(prevMap), ...Object.keys(curMap)]));
    let best: { category: string; changePct: number; cur: number; prev: number } | null = null;

    for (const cat of categories) {
      const prev = prevMap[cat] ?? 0;
      const cur = curMap[cat] ?? 0;
      if (cur <= 0) continue;
      const base = prev > 0 ? prev : null;
      const changePct = base ? (cur - prev) / base : 1;
      if (cur >= 500 && changePct >= 0.25) {
        if (!best || changePct > best.changePct) best = { category: cat, changePct, cur, prev };
      }
    }

    if (best) {
      const severity: NotificationSeverity = best.changePct >= 0.7 ? 'high' : 'medium';
      const category: NotificationCategory = severity === 'high' ? 'urgent' : 'opportunity';
      const priorityScore = 550 + Math.round(best.changePct * 100) + quantizeAmount(best.cur, 100);

      const actionTarget = `/dashboard/expenses`;
      const title = `${best.category} spending is up`;
      const description = `Expenses for ${best.category} are higher than the previous period. Review repeat purchases and vendors. Current: ${currencyAmountLabel(best.cur)}.`;

      pushCandidate(candidates, {
        type: 'expense_spike',
        category,
        title,
        description,
        severity,
        priorityScore,
        actionLabel: 'Review expenses',
        actionTarget,
        createdAt: nowIso,
        groupKey: `expense_spike:${best.category}:${quantizeAmount(best.cur, 500)}:${quantizeAmount(best.changePct * 100, 20)}`,
        metadata: {
          category: best.category,
          expensesPrevBase: best.prev,
          expensesCurBase: best.cur,
          changePct: best.changePct,
        },
      }, 8);
    }
  }

  // Stale quotes follow-up
  if (staleCount > 0) {
    const topQuote = staleQuotes
      .slice()
      .sort((a, b) => {
        const ea = a.expiry_date ? parseISO(a.expiry_date).getTime() : Number.POSITIVE_INFINITY;
        const eb = b.expiry_date ? parseISO(b.expiry_date).getTime() : Number.POSITIVE_INFINITY;
        return ea - eb;
      })[0];

    const severity: NotificationSeverity = staleCount >= 3 ? 'medium' : 'low';
    const category: NotificationCategory = severity === 'medium' ? 'action_needed' : 'opportunity';
    const priorityScore = 480 + staleCount * 40 + (topQuote?.expiry_date ? 35 : 0);
    const actionTarget = topQuote ? `/dashboard/quotes/${topQuote.id}` : `/dashboard/quotes`;

    const title = staleCount === 1 ? 'A quote needs follow-up' : `${staleCount} quotes need follow-up this week`;
    const description =
      'Follow up soon to reduce time-to-cash and prevent expiry.';

    pushCandidate(candidates, {
      type: 'stale_quotes_follow_up',
      category,
      title,
      description,
      severity,
      priorityScore,
      actionLabel: 'Follow up with quotes',
      actionTarget,
      createdAt: nowIso,
      groupKey: `stale_quotes:${staleCountBucket}:${staleExpiryBucket}`,
      metadata: {
        staleCount,
        topQuoteId: topQuote?.id ?? null,
      },
    }, 8);
  }

  // Quote rejected (recent)
  const rejectedRecent = quotes
    .filter((q) => String(q.status ?? '').toLowerCase() === 'rejected')
    .filter((q) => {
      if (!q.rejected_at) return false;
      const t = parseISO(q.rejected_at).getTime();
      return Number.isFinite(t) && t >= TWO_DAYS_AGO.getTime();
    })
    .filter((q) => num(q.total) >= 1000)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  if (rejectedRecent.length > 0) {
    const top = rejectedRecent[0];
    const severity: NotificationSeverity = rejectedRecent.length >= 2 ? 'medium' : 'low';
    const category: NotificationCategory = 'action_needed';
    const priorityScore = 430 + num(top.total) / 10;

    pushCandidate(candidates, {
      type: 'quote_rejected',
      category,
      title: 'A quote was rejected',
      description: `Review the quote outcome and consider the next step for ${top.customer_snapshot?.name ?? 'the customer'}. Amount: ${currencyAmountLabel(num(top.total))}.`,
      severity,
      priorityScore,
      actionLabel: 'Review quote',
      actionTarget: `/dashboard/quotes/${top.id}`,
      createdAt: nowIso,
      groupKey: `quote_rejected:${top.id}`,
      metadata: {
        quoteId: top.id,
        quoteNumber: top.quote_number,
      },
    }, 8);
  }

  // Payment received (recent, low noise)
  const paymentsRecent = payments
    .filter((p) => {
      if (!p.created_at) return false;
      const t = new Date(p.created_at).getTime();
      if (!Number.isFinite(t)) return false;
      return t >= TWO_DAYS_AGO.getTime();
    })
    .filter((p) => {
      const st = String(p.status ?? '').toLowerCase();
      return !st || ['succeeded', 'success', 'paid'].includes(st);
    });

  const paymentRecentTotal = paymentsRecent.reduce((s, p) => {
    const base = p.amount_in_base != null ? num(p.amount_in_base) : p.amount != null ? num(p.amount) : 0;
    return s + Math.max(0, base);
  }, 0);

  if (paymentRecentTotal >= MIN_PAYMENT_NOTIF) {
    const overduePenalty = overdueCount > 0 ? 1.15 : 1;
    const severity: NotificationSeverity = overduePenalty > 1 ? 'medium' : 'low';
    const category: NotificationCategory = overduePenalty > 1 ? 'action_needed' : 'info';
    const priorityScore = 250 + Math.round(paymentRecentTotal / 50) * overduePenalty;

    const hasHighOrMediumAny = candidates.some((c) => c.severity === 'high' || c.severity === 'medium');
    if (shouldKeepCandidate({ isHighOrMedium: severity !== 'low', hasHighOrMediumAny })) {
      pushCandidate(candidates, {
        type: 'payment_received',
        category,
        title: 'Payment received',
        description:
          overduePenalty > 1
            ? 'A payment has been recorded. Consider sending reminders for any remaining overdue balances.'
            : 'A payment was received. Keep an eye on outstanding balances to maintain cash flow.',
        severity,
        priorityScore,
        actionLabel: null,
        actionTarget: null,
        createdAt: nowIso,
        groupKey: `payment_received:${quantizeAmount(paymentRecentTotal, 500)}:${quantizeCount(paymentsRecent.length)}`,
        metadata: {
          paymentsCount: paymentsRecent.length,
          paymentTotalBase: paymentRecentTotal,
        },
      }, 8);
    }
  }

  // Invoice sent (optional info)
  const invoicesSentRecent = invoices
    .filter((inv) => String(inv.status ?? '').toLowerCase() === 'sent')
    .filter((inv) => {
      if (!inv.created_at) return false;
      const t = new Date(inv.created_at).getTime();
      return Number.isFinite(t) && t >= TWO_DAYS_AGO.getTime();
    })
    .filter((inv) => num(inv.total) >= 500)
    .sort((a, b) => (num(b.total) || 0) - (num(a.total) || 0));

  if (invoicesSentRecent.length > 0) {
    const sentCount = invoicesSentRecent.length;
    const sentTotalBase = invoicesSentRecent.reduce((s, inv) => {
      const rate = num(inv.exchange_rate_to_base);
      const baseTotal = inv.total_in_base != null && num(inv.total_in_base) > 0 ? num(inv.total_in_base) : num(inv.total) * (rate > 0 ? rate : 1);
      return s + Math.max(0, baseTotal);
    }, 0);

    const sentCountBucket = quantizeCount(sentCount);
    const sentAmountBucket = quantizeAmount(sentTotalBase, 1000);

    pushCandidate(candidates, {
      type: 'invoice_sent',
      category: 'info',
      title: sentCount === 1 ? 'Invoice sent' : `${sentCount} invoices sent`,
      description:
        sentCount === 1
          ? 'An invoice was sent to the customer. Keep an eye on outstanding balances.'
          : 'Invoices were sent recently. Follow up on open balances as they become due.',
      severity: 'low',
      priorityScore: 160 + quantizeAmount(sentTotalBase, 100) * 0.5,
      actionLabel: null,
      actionTarget: null,
      createdAt: nowIso,
      groupKey: `invoice_sent:${sentCountBucket}:${sentAmountBucket}`,
      metadata: {
        sentCount,
        sentTotalBase,
      },
    }, 8);
  }

  // Final suppression & sorting
  const hasUrgentOrActionNeeded = candidates.some((c) => c.category === 'urgent' || c.category === 'action_needed');
  const filtered = candidates.filter((c) => {
    if (!hasUrgentOrActionNeeded) return true;
    return c.category === 'urgent' || c.category === 'action_needed' || c.severity === 'high' || c.severity === 'medium';
  });

  return filtered.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return new Date(String(b.createdAt ?? nowIso)).getTime() - new Date(String(a.createdAt ?? nowIso)).getTime();
  });
}

