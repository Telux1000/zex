import type { NormalizedInvoiceRecord } from '@/lib/invoices/normalize';
import { normalizeInvoiceRecord, getInvoiceBaseAmount } from '@/lib/invoices/normalize';
import { getPaymentBaseAmount, normalizePaymentRecord } from '@/lib/payments/normalize';
import { INSIGHT_THRESHOLDS } from '@/lib/insights/constants';
import { expenseAmountInBase } from '@/lib/expenses/expense-base-amount';
import {
  getCurrentMonthRange,
  getPreviousMonthRange,
  getPreviousWeekRange,
  getWeekRangeContaining,
  isDateKeyInRange,
} from '@/lib/insights/periods';

export type FinancialInsight = {
  id: string;
  type: 'warning' | 'opportunity' | 'info';
  title: string;
  message: string;
  priority: number;
  actionLabel?: string;
  actionHref?: string;
};

export type ExpenseRowInput = {
  id?: string;
  expense_date: string;
  category?: string | null;
  amount: number | string | null;
  currency?: string | null;
  base_amount?: number | string | null;
  exchange_rate?: number | string | null;
  created_at?: string | null;
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function paidToBase(inv: NormalizedInvoiceRecord, baseCode: string): number {
  const paid = Math.max(0, num(inv.amount_paid));
  const rate = num(inv.exchange_rate_to_base);
  const cur = String(inv.currency || baseCode).toUpperCase();
  if (cur === baseCode.toUpperCase()) return paid;
  if (rate > 0) return paid * rate;
  return paid;
}

function sumExpensesByExpenseDate(
  expenses: ExpenseRowInput[],
  startKey: string,
  endKey: string,
  baseCode: string
): number {
  return expenses.reduce((s, e) => {
    const key = String(e.expense_date ?? '').slice(0, 10);
    if (!key || !isDateKeyInRange(key, startKey, endKey)) return s;
    return s + Math.max(0, expenseAmountInBase(e, baseCode));
  }, 0);
}

function sumCollectionsInRange(
  payments: Record<string, unknown>[],
  invoices: NormalizedInvoiceRecord[],
  startIso: string,
  endIso: string,
  baseCode: string
): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  let sum = 0;
  for (const p of payments) {
    const n = normalizePaymentRecord(p, baseCode);
    if (!n) continue;
    const t = new Date(n.payment_date).getTime();
    if (!Number.isFinite(t) || t < start || t > end) continue;
    if (['failed', 'cancelled', 'canceled', 'voided', 'refunded'].includes(n.status)) continue;
    sum += getPaymentBaseAmount(n, baseCode);
  }
  for (const inv of invoices) {
    if (!inv.paid_at) continue;
    const t = new Date(String(inv.paid_at)).getTime();
    if (!Number.isFinite(t) || t < start || t > end) continue;
    sum += paidToBase(inv, baseCode);
  }
  return sum;
}

function sumRevenueInvoicedInRange(
  invoices: NormalizedInvoiceRecord[],
  startIso: string,
  endIso: string
): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return invoices.reduce((s, inv) => {
    const raw = inv.created_at ?? inv.issue_date;
    if (!raw) return s;
    const t = new Date(String(raw)).getTime();
    if (!Number.isFinite(t) || t < start || t > end) return s;
    return s + getInvoiceBaseAmount(inv);
  }, 0);
}

function categoryTotalsMonth(
  expenses: ExpenseRowInput[],
  startKey: string,
  endKey: string,
  baseCode: string
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const e of expenses) {
    const key = String(e.expense_date ?? '').slice(0, 10);
    if (!key || !isDateKeyInRange(key, startKey, endKey)) continue;
    const cat = String(e.category || 'General').trim() || 'General';
    m[cat] = (m[cat] ?? 0) + Math.max(0, expenseAmountInBase(e, baseCode));
  }
  return m;
}

function weekdayIndexFromDateKey(key: string): number | null {
  const [y, mo, d] = key.split('-').map(Number);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d).getDay();
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function highestExpenseWeekday(
  expenses: ExpenseRowInput[],
  baseCode: string
): { day: string; amount: number; count: number } | null {
  const byDay: Record<number, { amount: number; count: number }> = {};
  for (const e of expenses) {
    const key = String(e.expense_date ?? '').slice(0, 10);
    const wd = weekdayIndexFromDateKey(key);
    if (wd == null) continue;
    const amt = Math.max(0, expenseAmountInBase(e, baseCode));
    if (!byDay[wd]) byDay[wd] = { amount: 0, count: 0 };
    byDay[wd].amount += amt;
    byDay[wd].count += 1;
  }
  const totalCount = Object.values(byDay).reduce((s, v) => s + v.count, 0);
  if (totalCount < INSIGHT_THRESHOLDS.weekdayPatternMinExpenses) return null;
  let best = -1;
  let bestAmt = 0;
  for (const [wd, v] of Object.entries(byDay)) {
    if (v.amount > bestAmt) {
      bestAmt = v.amount;
      best = Number(wd);
    }
  }
  if (best < 0) return null;
  return { day: WEEKDAY_NAMES[best], amount: bestAmt, count: byDay[best].count };
}

function countExpensesCreatedInRange(
  expenses: ExpenseRowInput[],
  startIso: string,
  endIso: string
): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return expenses.filter((e) => {
    const c = e.created_at;
    if (!c) return false;
    const t = new Date(String(c)).getTime();
    return Number.isFinite(t) && t >= start && t <= end;
  }).length;
}

function typeRank(t: FinancialInsight['type']): number {
  if (t === 'warning') return 0;
  if (t === 'opportunity') return 1;
  return 2;
}

function insightThemeKey(id: string): string {
  if (id.startsWith('expense-vs-collection')) return 'expense-vs-collection';
  if (id.startsWith('category-concentration')) return 'category-concentration';
  if (id.startsWith('expense-spike-')) return 'expense-spike';
  if (id.startsWith('weekly-')) return id;
  return id;
}

function dedupeAndCap(insights: FinancialInsight[], maxItems: number): FinancialInsight[] {
  const seen = new Set<string>();
  const out: FinancialInsight[] = [];
  const sorted = [...insights].sort((a, b) => {
    const pr = a.priority - b.priority;
    if (pr !== 0) return pr;
    return typeRank(a.type) - typeRank(b.type);
  });
  for (const ins of sorted) {
    const key = insightThemeKey(ins.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ins);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Merge financial + quote (or other) insights; lower priority number surfaces first. */
export function capInsights(insights: FinancialInsight[], maxItems: number): FinancialInsight[] {
  return dedupeAndCap(insights, maxItems);
}

export type GenerateInsightsInput = {
  baseCurrencyCode: string;
  /** e.g. /dashboard/invoices?filter=open */
  outstandingInvoicesHref: string;
  expenses: ExpenseRowInput[];
  paymentRows: Record<string, unknown>[];
  invoiceRows: Record<string, unknown>[];
  /** Outstanding open balance in base (already converted) */
  outstandingOpenBase: number;
  /** Collected this month base */
  monthlyCollectedBase: number;
  /** Invoiced/revenue this month base (invoices created this month) */
  monthlyRevenueBase: number;
  overdueInvoiceCount: number;
  now?: Date;
};

export function generateFinancialInsights(input: GenerateInsightsInput): FinancialInsight[] {
  const now = input.now ?? new Date();
  const base = (input.baseCurrencyCode || 'USD').toUpperCase();
  const invoices = input.invoiceRows
    .map((r) => normalizeInvoiceRecord(r, base))
    .filter((i): i is NormalizedInvoiceRecord => Boolean(i));

  const cw = getWeekRangeContaining(now);
  const pw = getPreviousWeekRange(now);
  const cm = getCurrentMonthRange(now);
  const pm = getPreviousMonthRange(now);

  const weekStartIso = `${cw.startKey}T00:00:00.000`;
  const weekEndIso = `${cw.endKey}T23:59:59.999`;
  const prevWeekStartIso = `${pw.startKey}T00:00:00.000`;
  const prevWeekEndIso = `${pw.endKey}T23:59:59.999`;
  const monthStartIso = `${cm.startKey}T00:00:00.000`;
  const monthEndIso = `${cm.endKey}T23:59:59.999`;
  const prevMonthStartIso = `${pm.startKey}T00:00:00.000`;
  const prevMonthEndIso = `${pm.endKey}T23:59:59.999`;

  const expensesWeek = sumExpensesByExpenseDate(input.expenses, cw.startKey, cw.endKey, base);
  const expensesPrevWeek = sumExpensesByExpenseDate(input.expenses, pw.startKey, pw.endKey, base);
  const expensesMonth = sumExpensesByExpenseDate(input.expenses, cm.startKey, cm.endKey, base);
  const expensesPrevMonth = sumExpensesByExpenseDate(input.expenses, pm.startKey, pm.endKey, base);

  const collWeek = sumCollectionsInRange(input.paymentRows, invoices, weekStartIso, weekEndIso, base);
  const collPrevWeek = sumCollectionsInRange(
    input.paymentRows,
    invoices,
    prevWeekStartIso,
    prevWeekEndIso,
    base
  );
  const collMonth = sumCollectionsInRange(
    input.paymentRows,
    invoices,
    monthStartIso,
    monthEndIso,
    base
  );

  const revWeek = sumRevenueInvoicedInRange(invoices, weekStartIso, weekEndIso);
  const revPrevWeek = sumRevenueInvoicedInRange(invoices, prevWeekStartIso, prevWeekEndIso);
  const revMonth = input.monthlyRevenueBase;

  const insights: FinancialInsight[] = [];
  const T = INSIGHT_THRESHOLDS;

  if (expensesWeek > collWeek * T.expenseVsCollectionWarningRatio && collWeek >= 0 && expensesWeek > 0) {
    insights.push({
      id: 'expense-vs-collection-week',
      type: 'warning',
      title: 'Expenses Exceeding Collections',
      message: `This week, expenses are higher than what you collected. Increase collections or trim spending to ease cash pressure.`,
      priority: 1,
      actionLabel: 'View open invoices',
      actionHref: input.outstandingInvoicesHref,
    });
  } else if (expensesMonth > collMonth * T.expenseVsCollectionWarningRatio && collMonth >= 0 && expensesMonth > 50) {
    insights.push({
      id: 'expense-vs-collection-month',
      type: 'warning',
      title: 'Expenses Outpace Collections',
      message: `This month, spending has exceeded collections. Align billing and collections with your cost run-rate.`,
      priority: 2,
      actionLabel: 'View open invoices',
      actionHref: input.outstandingInvoicesHref,
    });
  }

  if (
    expensesMonth > input.monthlyRevenueBase * T.expenseVsRevenueWarningRatio &&
    input.monthlyRevenueBase > 0
  ) {
    insights.push({
      id: 'expense-vs-revenue-month',
      type: 'warning',
      title: 'Expenses Exceed Revenue',
      message: `This period, recorded expenses are higher than new invoice revenue. Review costs and invoice activity.`,
      priority: 2,
    });
  }

  const cats = categoryTotalsMonth(input.expenses, cm.startKey, cm.endKey, base);
  const totalCat = Object.values(cats).reduce((s, v) => s + v, 0);
  if (totalCat > 0) {
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    const share = top[1] / totalCat;
    if (share >= T.highCategoryShareWarning) {
      insights.push({
        id: 'category-concentration',
        type: 'warning',
        title: 'Category Spending Concentration',
        message: `A large share of this month’s expenses (${Math.round(share * 100)}%) is in ${top[0]}. Check that this spend is delivering enough value.`,
        priority: 3,
      });
    } else if (share >= T.highCategoryShareInfo) {
      insights.push({
        id: 'category-concentration-info',
        type: 'info',
        title: 'Category Spending Concentration',
        message: `About ${Math.round(share * 100)}% of this month’s expenses are in ${top[0]}.`,
        priority: 5,
      });
    }
  }

  const catPrev = categoryTotalsMonth(input.expenses, pm.startKey, pm.endKey, base);
  for (const [name, amt] of Object.entries(cats)) {
    const prev = catPrev[name] ?? 0;
    if (prev <= 0 || amt <= 0) continue;
    const chg = (amt - prev) / prev;
    if (chg >= T.meaningfulPercentChange) {
      insights.push({
        id: `expense-spike-${name}`,
        type: 'opportunity',
        title: 'Expense Reduction Opportunity',
        message: `${name} spending is up about ${Math.round(chg * 100)}% vs last month. Review repeat purchases and vendor pricing.`,
        priority: 4,
      });
      break;
    }
  }

  if (expensesPrevWeek > 0 && expensesWeek > 0) {
    const expChg = (expensesWeek - expensesPrevWeek) / expensesPrevWeek;
    const revChg =
      revPrevWeek > 0 ? (revWeek - revPrevWeek) / revPrevWeek : revWeek > 0 ? 1 : 0;
    if (expChg >= T.meaningfulPercentChange && expChg > revChg + 0.05) {
      insights.push({
        id: 'expense-faster-than-revenue',
        type: 'opportunity',
        title: 'Spending Pace vs Revenue',
        message: `Expenses grew faster than invoiced revenue week over week. Consider pacing discretionary costs.`,
        priority: 4,
      });
    }
  }

  const wd = highestExpenseWeekday(input.expenses, base);
  if (wd) {
    insights.push({
      id: 'weekday-pattern',
      type: 'info',
      title: 'Spending Pattern Detected',
      message: `Expenses tend to cluster on ${wd.day}s by total amount. Review recurring costs tied to that day.`,
      priority: 6,
    });
  }

  const pressure =
    input.outstandingOpenBase > Math.max(collMonth, 1) * T.collectionsPressureOutstandingVsCollected;
  const lowCover = collMonth > 0 && collMonth < expensesMonth * 0.95;
  if (input.overdueInvoiceCount > 0 || (pressure && input.outstandingOpenBase > 100) || lowCover) {
    insights.push({
      id: 'improve-collections',
      type: 'opportunity',
      title: 'Improve Collections',
      message:
        input.overdueInvoiceCount > 0
          ? `You have overdue invoices. Collecting open balances would strengthen cash flow against current expenses.`
          : `Outstanding receivables are elevated relative to recent collections. Prioritizing follow-ups reduces cash-flow risk.`,
      priority: input.overdueInvoiceCount > 0 ? 2 : 4,
      actionLabel: 'View outstanding invoices',
      actionHref: input.outstandingInvoicesHref,
    });
  }

  if (
    collMonth > 0 &&
    expensesMonth > collMonth * (1 / T.cashCrisisCollectionRatio) &&
    input.outstandingOpenBase > expensesMonth * T.cashCrisisOutstandingVsExpenses
  ) {
    insights.push({
      id: 'cash-flow-risk',
      type: 'warning',
      title: 'Cash-Flow Risk',
      message: `At the current pace, collections may not comfortably cover expenses while payables remain open. Prioritize overdue follow-ups and non-essential spend.`,
      priority: 1,
      actionLabel: 'Review invoices',
      actionHref: input.outstandingInvoicesHref,
    });
  }

  if (expensesPrevWeek > 0) {
    const pct = (expensesWeek - expensesPrevWeek) / expensesPrevWeek;
    if (Math.abs(pct) >= T.weeklyChangeWarningPercent) {
      insights.push({
        id: 'weekly-expense-compare',
        type: pct > 0 ? 'info' : 'info',
        title: pct > 0 ? 'Expenses Up This Week' : 'Expenses Down This Week',
        message:
          pct > 0
            ? `Week-to-date expenses are about ${Math.round(pct * 100)}% higher than last week.`
            : `Week-to-date expenses are about ${Math.round(Math.abs(pct) * 100)}% lower than last week.`,
        priority: 6,
      });
    }
  }

  if (collPrevWeek > 0 || collWeek > 0) {
    const baseC = Math.max(collPrevWeek, 1);
    const pct = (collWeek - collPrevWeek) / baseC;
    if (Math.abs(pct) >= T.weeklyChangeWarningPercent) {
      insights.push({
        id: 'weekly-collection-compare',
        type: 'info',
        title: pct >= 0 ? 'Collections Up This Week' : 'Collections Down This Week',
        message: `Collections moved about ${Math.round(pct * 100)}% vs last week.`,
        priority: 7,
      });
    }
  }

  const expCountWeek = countExpensesCreatedInRange(input.expenses, weekStartIso, weekEndIso);
  const expCountPrev = countExpensesCreatedInRange(input.expenses, prevWeekStartIso, prevWeekEndIso);
  if (expCountWeek >= 3 && expCountPrev > 0 && expCountWeek > expCountPrev) {
    insights.push({
      id: 'expense-count-week',
      type: 'info',
      title: 'Expense Activity Increased',
      message: `You recorded ${expCountWeek} expenses this week, up from ${expCountPrev} last week.`,
      priority: 8,
    });
  }

  return dedupeAndCap(insights, 5);
}
