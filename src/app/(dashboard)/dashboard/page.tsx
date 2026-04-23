import Link from 'next/link';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { FileText, Receipt, Users, Wallet } from 'lucide-react';
import {
  getPrimaryBusinessForUser,
  getServerSupabaseUser,
} from '@/lib/supabase/server-auth';
import { isOnboardingComplete } from '@/lib/onboarding/completion';
import { shouldShowDashboardSetupCallout } from '@/lib/onboarding/unified-setup-banner';
import { formatDisplayDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { formatCurrencyAmount, formatMoneyCodeFirst } from '@/lib/utils/currency';
import { isBusinessProfileComplete } from '@/lib/business/profile';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { INVOICE_MANAGEMENT_FILTER_OPEN } from '@/lib/invoices/list-filters';
import {
  formatShortWeekLabel,
  sumInWeekBuckets,
  weekBucketStartsCoveringRange,
} from '@/lib/dashboard/chart-buckets';
import {
  DASHBOARD_TZ_COOKIE,
  isSafeIanaTimeZone,
  formatDashboardDateKey,
  getDashboardFinancialRange,
  parseDashboardRangeParam,
  revenueKpiTitle,
} from '@/lib/dashboard/date-range';
import {
  generateFinancialInsights,
  capInsights,
  type ExpenseRowInput,
} from '@/lib/insights/generate';
import { generateQuoteInsights } from '@/lib/insights/quote-insights';
import { INSIGHT_THRESHOLDS } from '@/lib/insights/constants';
import { customerLabelFromSnapshot } from '@/lib/quotes/customer-label';
import {
  buildActivityFeedItems,
  type ActivityEventRow,
  type ExpenseActivityRow,
  type PaymentActivityRow,
} from '@/lib/activity/feed';
import { getPaymentBaseAmount, getPaymentsInFinancialRange } from '@/lib/payments/normalize';
import { computeCollectedRevenueMetric } from '@/lib/payments/collected-revenue-metric';
import {
  fetchEarliestPendingDueYmdByInvoiceIds,
  loadDashboardOverdueSnapshot,
  logOverdueParityDebug,
  normalizedInvoiceMatchesDashboardOverdue,
  resolveCivilTodayYmdForOverdue,
} from '@/lib/invoices/dashboard-invoice-overdue';
import {
  normalizeInvoiceRecord,
  getInvoiceBaseAmount,
  getInvoiceRemainingBalance,
  isInvoiceOpen,
  isInvoiceOpenForReporting,
  type NormalizedInvoiceRecord,
} from '@/lib/invoices/normalize';
import { OnboardingWelcomeCelebration } from '@/components/dashboard/OnboardingWelcomeCelebration';
import { DashboardHomeHeader } from '@/components/dashboard/DashboardHomeHeader';
import { DashboardCard } from '@/components/dashboard/ui/dashboard-card';
import { BusinessHealthCard } from '@/components/dashboard/BusinessHealthCard';
import { RevenueOverviewChart } from '@/components/dashboard/RevenueOverviewChart';
import {
  DashboardQuickActionsPanel,
  type DashboardTaskItem,
} from '@/components/dashboard/DashboardQuickActionsPanel';
import { DashboardInsightsCard } from '@/components/dashboard/DashboardInsightsCard';
import { DashboardActivityCard } from '@/components/dashboard/DashboardActivityCard';
import { fetchOnboardingEntryState } from '@/lib/onboarding/entry-state';

export const dynamic = 'force-dynamic';

async function selectInvoicesWithFallback(
  supabase: any,
  businessId: string,
  primaryCols: string,
  fallbackCols: string,
  apply: (q: any) => any
) {
  const primary = await apply(
    supabase.from('invoices').select(primaryCols).eq('business_id', businessId)
  );
  if (!primary.error) return primary;
  if (!/column .* does not exist/i.test(primary.error?.message ?? '')) return primary;
  return apply(
    supabase.from('invoices').select(fallbackCols).eq('business_id', businessId)
  );
}

async function selectPaymentsWithFallback(
  supabase: any,
  businessId: string,
  apply: (q: any) => any
) {
  const primary = await apply(
    supabase
      .from('payments')
      .select(
        'id, invoice_id, amount, amount_in_base, currency, exchange_rate_to_base, status, created_at, paid_at, metadata'
      )
      .eq('business_id', businessId)
  );
  if (!primary.error) return primary;
  if (!/column .* does not exist/i.test(primary.error?.message ?? '')) return primary;
  return apply(
    supabase
      .from('payments')
      .select('id, invoice_id, amount, created_at, paid_at, status')
      .eq('business_id', businessId)
  );
}

/** Issued revenue in base for dashboard period (accrual-style invoice totals). */
function invoiceRevenueInBaseForDashboard(n: NormalizedInvoiceRecord): number {
  const st = deriveInvoiceStatus({
    status: n.status,
    total: n.total,
    amount_paid: n.amount_paid,
    balance_due: n.balance_due,
  });
  if (['draft', 'voided', 'cancelled'].includes(String(st).toLowerCase())) return 0;
  return getInvoiceBaseAmount(n);
}

function resolveInvoiceIssuedDateKeyForDashboard(
  invoice: NormalizedInvoiceRecord,
): string | null {
  const issue = String(invoice.issue_date ?? '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(issue)) return issue;
  return null;
}

function invoiceIsIssuedForRevenue(invoice: NormalizedInvoiceRecord): boolean {
  const st = String(
    deriveInvoiceStatus({
      status: invoice.status,
      total: invoice.total,
      amount_paid: invoice.amount_paid,
      balance_due: invoice.balance_due,
    })
  ).toLowerCase();
  return !['draft', 'voided', 'cancelled'].includes(st);
}

function greetingFirstNameFromProfileAndUser(
  profile: { full_name?: string | null } | null,
  user: User
) {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const u = user as User & { fullName?: string | null; name?: string | null };
  const profileFull =
    profile?.full_name != null ? String(profile.full_name).trim() : '';
  const displayName =
    profileFull ||
    (typeof u.fullName === 'string' ? u.fullName.trim() : '') ||
    (typeof u.name === 'string' ? u.name.trim() : '') ||
    (typeof meta?.full_name === 'string' ? meta.full_name.trim() : '') ||
    (typeof meta?.name === 'string' ? meta.name.trim() : '') ||
    '';
  const firstName = displayName.trim().split(/\s+/)[0] || '';
  return firstName;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { range?: string; notice?: string };
}) {
  const cookieStore = cookies();
  const dashboardTzRaw = cookieStore.get(DASHBOARD_TZ_COOKIE)?.value ?? null;
  const dashboardTz = dashboardTzRaw
    ? (() => {
        try {
          return decodeURIComponent(dashboardTzRaw);
        } catch {
          return null;
        }
      })()
    : null;

  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const business = await getPrimaryBusinessForUser(user.id);
  const entryState = await fetchOnboardingEntryState(supabase, user.id, business);
  if (!business) {
    if (entryState.should_show_plan_selection) {
      redirect('/onboarding?step=pricing');
    }
    return (
      <div className="mx-auto max-w-2xl">
        <DashboardCard>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Welcome to Zenzex
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Create your business to start invoicing.
          </p>
          <Link
            href="/onboarding?step=1"
            className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Set up business
          </Link>
        </DashboardCard>
      </div>
    );
  }

  const businessTz = isSafeIanaTimeZone(String(business.timezone ?? ''))
    ? String(business.timezone)
    : null;
  const effectiveDashboardTz = dashboardTz && isSafeIanaTimeZone(dashboardTz) ? dashboardTz : businessTz;
  const financialRange = getDashboardFinancialRange(
    parseDashboardRangeParam(searchParams?.range),
    new Date(),
    effectiveDashboardTz
  );
  const rangeStart = financialRange.startIso;
  /** Upper bound for payment queries (same instant used later for collected KPI math). */
  const rangeEndForCollections = new Date();
  const rangePeriodStart = new Date(financialRange.startIso);
  const rangeStartMs = rangePeriodStart.getTime();
  const rangeStartDateKey = formatDashboardDateKey(rangePeriodStart, effectiveDashboardTz);

  const civilTodayYmd = resolveCivilTodayYmdForOverdue(new Date(), effectiveDashboardTz);
  const insightHorizon = new Date();
  insightHorizon.setDate(insightHorizon.getDate() - 120);
  const insightHorizonDateKey = insightHorizon.toISOString().slice(0, 10);
  const [
    recentInvoicesRes,
    allInvoicesMetricsRes,
    paymentsInRangeRes,
    expensesForInsightsRes,
    activityEventsRes,
    paymentsForInsightsRes,
    customersCountRes,
    invoicesCountRes,
    expensesCountRes,
    quotesRes,
  ] = await Promise.all([
    selectInvoicesWithFallback(
      supabase,
      business.id,
      'id, invoice_number, customer_name, subtotal, tax_amount, total, total_in_base, currency, base_currency_code, exchange_rate_to_base, status, issue_date, due_date, amount_paid, balance_due, created_at',
      'id, invoice_number, customer_name, total, currency, status, issue_date, due_date, amount_paid, balance_due, created_at',
      (q) =>
        q
          .gte('created_at', rangeStart)
          .order('created_at', { ascending: false })
          .limit(3)
    ),
    selectInvoicesWithFallback(
      supabase,
      business.id,
      'id, invoice_number, customer_name, due_date, status, subtotal, tax_amount, total, total_in_base, currency, base_currency_code, amount_paid, balance_due, issue_date, paid_at, exchange_rate_to_base, use_payment_schedule, created_at, updated_at',
      'id, invoice_number, customer_name, due_date, status, total, currency, amount_paid, balance_due, issue_date, paid_at, created_at, use_payment_schedule, updated_at',
      (q) => q
    ),
    selectPaymentsWithFallback(supabase, business.id, (q) =>
      q
        .gte('paid_at', rangeStart)
        .lte('paid_at', rangeEndForCollections.toISOString())
        .order('paid_at', { ascending: false })
        .limit(5000)
    ),
    supabase
      .from('expenses')
      .select(
        'id, expense_date, category, amount, created_at, updated_at, description, attachment_url'
      )
      .eq('business_id', business.id)
      .gte('expense_date', insightHorizonDateKey)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('activity_events')
      .select('id, type, title, description, created_at, entity_type, entity_id')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(80),
    selectPaymentsWithFallback(supabase, business.id, (q) =>
      q.gte('created_at', insightHorizon.toISOString())
    ),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id),
    supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id),
    supabase
      .from('quotes')
      .select(
        'id, quote_number, status, converted_invoice_id, customer_snapshot, total, currency, expiry_date, updated_at, created_at'
      )
      .eq('business_id', business.id)
      .in('status', ['sent', 'accepted']),
  ]);

  const { data: profileForGreeting } = await supabase
    .from('profiles')
    .select('full_name, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle();
  const customersCount = customersCountRes.count ?? 0;
  const onboardingDoneForSetupBanner = isOnboardingComplete(
    profileForGreeting as {
      full_name?: string | null;
      onboarding_completed_at?: string | null;
    } | null,
    business,
    customersCount
  );
  const hideDashboardSetupChecklist = shouldShowDashboardSetupCallout({
    coreSetupComplete: onboardingDoneForSetupBanner,
  });

  const baseCode = (business.currency || 'USD').toUpperCase();
  const invoices = ((recentInvoicesRes.data ?? []) as Record<string, unknown>[])
    .map((i: Record<string, unknown>) => normalizeInvoiceRecord(i, baseCode))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((i) => ({
      ...i,
      status: deriveInvoiceStatus({
        status: i.status,
        total: i.total,
        amount_paid: i.amount_paid,
        balance_due: i.balance_due,
      }),
    }));

  const payments = (paymentsInRangeRes.data ?? []) as Record<string, unknown>[];
  const rawInvoiceMetrics = ((allInvoicesMetricsRes.data ?? []) as Record<string, unknown>[])
    .map((i: Record<string, unknown>) => normalizeInvoiceRecord(i, baseCode))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((i) => ({
      ...i,
      status: deriveInvoiceStatus({
        status: i.status,
        total: i.total,
        amount_paid: i.amount_paid,
        balance_due: i.balance_due,
      }) as string,
    }));

  const invoiceIdsForSchedule = rawInvoiceMetrics.map((r) => String(r.id)).filter(Boolean);
  const earliestPendingDueByInvoice =
    invoiceIdsForSchedule.length > 0
      ? await fetchEarliestPendingDueYmdByInvoiceIds(supabase, invoiceIdsForSchedule)
      : new Map<string, string>();

  // Evaluate after DB work: payments with created_at between request start and fetch completion
  // must satisfy t <= rangeEnd or "today" collections look clipped.
  const rangeEnd = new Date();
  const rangeEndMs = rangeEnd.getTime();
  const rangeEndDateKey = formatDashboardDateKey(rangeEnd, effectiveDashboardTz);
  const issuedInvoicesInPeriod = rawInvoiceMetrics.filter((inv) => {
    if (!invoiceIsIssuedForRevenue(inv)) return false;
    const issuedDateKey = resolveInvoiceIssuedDateKeyForDashboard(inv);
    if (!issuedDateKey) return false;
    return issuedDateKey >= rangeStartDateKey && issuedDateKey <= rangeEndDateKey;
  });
  const periodRevenue = issuedInvoicesInPeriod.reduce(
    (sum, inv) => sum + invoiceRevenueInBaseForDashboard(inv),
    0
  );

  const overdueSnapshot = await loadDashboardOverdueSnapshot(supabase, business.id, {
    baseCurrencyCode: baseCode,
    workspaceTimezone: effectiveDashboardTz,
  });

  logOverdueParityDebug({
    surface: 'dashboard_page',
    overdueCount: overdueSnapshot.invoiceCount,
    civilTodayYmd,
    extra: { businessId: business.id },
  });

  const overdueTotal = overdueSnapshot.totalBase;

  // Collected KPI: sum of payment ledger rows in [rangeStart, rangeEnd] by paid_at (not invoice totals).
  const collectedMetric = computeCollectedRevenueMetric(
    payments,
    [],
    baseCode,
    rangePeriodStart,
    rangeEnd,
    {
      surface: 'dashboard',
      fetchStartIso: rangeStart,
      rangeEndIso: rangeEnd.toISOString(),
      timezone: effectiveDashboardTz,
      dashboardPreset: financialRange.preset,
    }
  );
  const collectedBreakdown = collectedMetric.breakdown;
  const periodNetCollected = collectedMetric.totalBase;
  const showCollectedPriorPeriodNote = periodRevenue <= 0.0001 && periodNetCollected > 0.0001;
  console.info('[dashboard.revenue_card.debug]', {
    businessId: business.id,
    timezone: effectiveDashboardTz ?? null,
    rangePreset: financialRange.preset,
    rangeStartDateKey,
    rangeEndDateKey,
    dateField: 'issue_date',
    statusIncluded: ['sent', 'viewed', 'paid', 'partially_paid', 'partially_refunded', 'overdue', 'refunded'],
    statusExcluded: ['draft', 'voided', 'cancelled'],
    issuedInvoiceCountInRange: issuedInvoicesInPeriod.length,
    periodRevenueBase: periodRevenue,
    periodCollectedBase: periodNetCollected,
    divergenceCollectedNonZeroRevenueZero: showCollectedPriorPeriodNote,
  });
  const periodCollectedPct =
    periodRevenue > 0
      ? Math.max(0, Math.min(100, (periodNetCollected / periodRevenue) * 100))
      : 0;
  const expenseRows = (expensesForInsightsRes.data ?? []) as ExpenseRowInput[];
  const periodExpenses = expenseRows
    .filter((e) => {
      const key = String(e.expense_date ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
      return key >= rangeStartDateKey && key <= rangeEndDateKey;
    })
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  const expensePctOfRevenue =
    periodRevenue > 0
      ? Math.max(0, Math.min(999, (periodExpenses / periodRevenue) * 100))
      : 0;

  const outstanding = rawInvoiceMetrics
    .filter((i) => isInvoiceOpen(i))
    .reduce((s, i) => {
      const rate = Number(i.exchange_rate_to_base ?? 1);
      return s + getInvoiceRemainingBalance(i) * rate;
    }, 0);
  const unpaidInvoiceCount = rawInvoiceMetrics.filter((i) => isInvoiceOpen(i)).length;

  const openInvoices = rawInvoiceMetrics.filter((i) => isInvoiceOpen(i));
  const overdueOpenCount = openInvoices.filter((i) =>
    normalizedInvoiceMatchesDashboardOverdue(i, earliestPendingDueByInvoice, civilTodayYmd)
  ).length;
  const overdueRatio =
    openInvoices.length > 0 ? overdueOpenCount / openInvoices.length : 0;
  const baseBilled = rawInvoiceMetrics.reduce(
    (s, i) => s + Number(i.total_in_base ?? 0),
    0
  );
  const baseCollected = rawInvoiceMetrics.reduce((s, i) => {
    const rate =
      Number(i.exchange_rate_to_base ?? 0) > 0
        ? Number(i.exchange_rate_to_base)
        : String(i.currency).toUpperCase() === baseCode
          ? 1
          : 1;
    return s + Number(i.amount_paid ?? 0) * rate;
  }, 0);
  const collectionRatio = baseBilled > 0 ? baseCollected / baseBilled : 0;

  const revenueBase = Math.max(periodRevenue, 1);
  const collectionsCoverage =
    periodExpenses > 0 ? periodNetCollected / periodExpenses : periodNetCollected > 0 ? 1 : 0;
  const overdueRevenueRatio = Math.max(0, Math.min(1, overdueTotal / revenueBase));
  const expenseRatio = Math.max(0, periodExpenses / revenueBase);
  const outstandingRatio = Math.max(0, outstanding / revenueBase);
  const expenseCategoryTotals = expenseRows
    .filter((e) => {
      const dk = String(e.expense_date ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return false;
      return dk >= rangeStartDateKey && dk <= rangeEndDateKey;
    })
    .reduce<Record<string, number>>((acc, e) => {
      const key = String(e.category || 'Other').trim() || 'Other';
      acc[key] = (acc[key] ?? 0) + Number(e.amount ?? 0);
      return acc;
    }, {});
  const highestExpenseCategoryShare =
    periodExpenses > 0
      ? Math.max(
          0,
          ...Object.values(expenseCategoryTotals).map((v) => v / periodExpenses)
        )
      : 0;
  const collectionsPenalty =
    collectionsCoverage >= 1.2
      ? 0
      : collectionsCoverage >= 1
        ? 5
        : collectionsCoverage >= 0.85
          ? 15
          : collectionsCoverage >= 0.7
            ? 28
            : 40;
  const overduePenalty =
    overdueRevenueRatio < 0.05
      ? 0
      : overdueRevenueRatio < 0.1
        ? 6
        : overdueRevenueRatio < 0.2
          ? 12
          : overdueRevenueRatio < 0.35
            ? 18
            : 20;
  const expensePenalty =
    expenseRatio < 0.5
      ? 0
      : expenseRatio < 0.7
        ? 5
        : expenseRatio < 0.9
          ? 11
          : expenseRatio < 1.1
            ? 16
            : 18;
  const outstandingPenalty =
    outstandingRatio < 0.2
      ? 0
      : outstandingRatio < 0.4
        ? 5
        : outstandingRatio < 0.7
          ? 10
          : 15;
  const concentrationPenalty =
    highestExpenseCategoryShare < 0.35
      ? 0
      : highestExpenseCategoryShare < 0.5
        ? 3
        : highestExpenseCategoryShare < 0.65
          ? 5
          : 7;

  const riskPenalties = [
    { key: 'collections', penalty: collectionsPenalty },
    { key: 'overdue', penalty: overduePenalty },
    { key: 'expense', penalty: expensePenalty },
    { key: 'outstanding', penalty: outstandingPenalty },
    { key: 'concentration', penalty: concentrationPenalty },
  ];
  const totalPenalties = riskPenalties.reduce((sum, item) => sum + item.penalty, 0);
  const businessHealthScore = Math.max(0, Math.min(100, Math.round(100 - totalPenalties)));
  const businessHealthLabel: 'Healthy' | 'Stable' | 'At Risk' | 'Critical' =
    businessHealthScore >= 80
      ? 'Healthy'
      : businessHealthScore >= 60
        ? 'Stable'
        : businessHealthScore >= 40
          ? 'At Risk'
          : 'Critical';

  const topRisk = riskPenalties.sort((a, b) => b.penalty - a.penalty)[0]?.key ?? 'collections';
  const businessHealthSummary =
    topRisk === 'collections'
      ? 'Collections are not fully covering current expenses.'
      : topRisk === 'overdue'
        ? 'Overdue invoices are increasing payment risk.'
        : topRisk === 'expense'
          ? 'Expense pressure is reducing operating margin.'
          : topRisk === 'outstanding'
            ? 'Outstanding invoices are creating cash-flow risk.'
            : 'Spending is concentrated in one major category.';


  const financialInsights = generateFinancialInsights({
    baseCurrencyCode: baseCode,
    outstandingInvoicesHref: `/dashboard/invoices?filter=${INVOICE_MANAGEMENT_FILTER_OPEN}`,
    expenses: (expensesForInsightsRes.data ?? []) as ExpenseRowInput[],
    paymentRows: (paymentsForInsightsRes.data ?? []) as Record<string, unknown>[],
    invoiceRows: (allInvoicesMetricsRes.data ?? []) as Record<string, unknown>[],
    outstandingOpenBase: outstanding,
    monthlyCollectedBase: periodNetCollected,
    monthlyRevenueBase: periodRevenue,
    overdueInvoiceCount: overdueSnapshot.invoiceCount,
  });
  const quoteInsightRows = (quotesRes.data ?? []) as Parameters<
    typeof generateQuoteInsights
  >[0]['quotes'];
  const quoteInsights = generateQuoteInsights({
    quotes: quoteInsightRows,
    baseCurrencyCode: baseCode,
    quotesHref: '/dashboard/quotes',
  });
  const dashboardInsights = capInsights([...quoteInsights, ...financialInsights], 6);

  const activityEventsInRange = ((activityEventsRes.data ?? []) as ActivityEventRow[]).filter(
    (ev) => {
      const t = new Date(ev.created_at).getTime();
      return Number.isFinite(t) && t >= rangeStartMs && t <= rangeEndMs;
    }
  );
  const expensesInRangeForActivity = expenseRows.filter((e) => {
    const dk = String(e.expense_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return false;
    return dk >= rangeStartDateKey && dk <= rangeEndDateKey;
  }) as ExpenseActivityRow[];
  const activityFeed = buildActivityFeedItems({
    events: activityEventsInRange,
    expenses: expensesInRangeForActivity,
    payments: payments as PaymentActivityRow[],
    currencyCode: business.currency ?? 'USD',
    limit: 2,
  });

  const coreBusinessProfileComplete = isBusinessProfileComplete(business);
  const hasSenderAddress = Boolean(String(business.address_line1 ?? '').trim());
  const businessDetailsOnInvoicesComplete = coreBusinessProfileComplete && hasSenderAddress;
  const invoicesCount = invoicesCountRes.count ?? 0;
  const expensesCount = expensesCountRes.count ?? 0;

  const checklistItems = [
    {
      id: 'business',
      label: 'Legal name, contact & address on invoices',
      cta: 'Update details',
      href: '/settings?section=business-profile',
      complete: businessDetailsOnInvoicesComplete,
    },
    {
      id: 'customer',
      label: 'First customer',
      cta: 'Add customer',
      href: '/dashboard/customers?add=1',
      complete: customersCount > 0,
    },
    ...(customersCount > 0
      ? ([
          {
            id: 'invoice' as const,
            label: 'First invoice',
            cta: 'Create invoice',
            href: '/dashboard/invoices/new',
            complete: invoicesCount > 0,
          },
        ] as const)
      : []),
  ] as const;
  const remainingChecklist = checklistItems.filter((i) => !i.complete);
  const totalSteps = customersCount > 0 ? 4 : 3;
  const completedSteps =
    1 +
    (businessDetailsOnInvoicesComplete ? 1 : 0) +
    (customersCount > 0 ? 1 : 0) +
    (invoicesCount > 0 ? 1 : 0);

  const weekStarts = weekBucketStartsCoveringRange(rangePeriodStart, rangeEnd);
  const chartLabels = weekStarts.map((d) => formatShortWeekLabel(d));
  const ledgerChartPoints = getPaymentsInFinancialRange(
    payments,
    rangePeriodStart,
    rangeEnd,
    baseCode
  )
    .filter((p) => Number(p.amount ?? 0) > 0)
    .map((p) => ({
      at: p.payment_date,
      amount: getPaymentBaseAmount(p, baseCode),
    }));
  const supplementChartPoints = collectedBreakdown.supplements.map((s) => ({
    at: s.atIso,
    amount: s.amountBase,
  }));
  const paymentRows = [...ledgerChartPoints, ...supplementChartPoints];
  const invoiceRows = issuedInvoicesInPeriod
    .map((inv) => {
      const issueYmd = String(inv.issue_date ?? '').trim().slice(0, 10);
      const at = /^\d{4}-\d{2}-\d{2}$/.test(issueYmd)
        ? `${issueYmd}T12:00:00.000Z`
        : String(inv.created_at ?? '');
      const t = new Date(at).getTime();
      if (!Number.isFinite(t) || t < rangeStartMs || t > rangeEndMs) return null;
      return {
        at,
        amount: invoiceRevenueInBaseForDashboard(inv),
      };
    })
    .filter((r): r is { at: string; amount: number } => r != null);
  const paymentsSeries = sumInWeekBuckets(weekStarts, paymentRows);
  const revenueSeries = sumInWeekBuckets(weekStarts, invoiceRows);
  const chartPeak = Math.max(
    1,
    ...revenueSeries,
    ...paymentsSeries,
    1000
  );
  const chartYMax = Math.ceil(chartPeak * 1.12 / 1000) * 1000;
  const statusColors: Record<string, string> = {
    draft:
      'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    pending:
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200',
    sent: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200',
    viewed:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    partially_paid:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    paid: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200',
    partially_refunded: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
    refunded: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    cancelled: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
    voided: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
  };

  const firstName = greetingFirstNameFromProfileAndUser(
    profileForGreeting as { full_name?: string | null } | null,
    user
  );
  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const msInDay = 24 * 60 * 60 * 1000;
  const HIGH_VALUE_THRESHOLD = INSIGHT_THRESHOLDS.highExpenseActivityAmount;
  const QUOTE_FOLLOW_UP_DAYS = 3;
  const taskCandidates: Array<DashboardTaskItem & { priority: number }> = [];
  const seenTaskIds = new Set<string>();
  for (const inv of rawInvoiceMetrics) {
    const invId = String(inv.id || '').trim();
    if (!invId) continue;
    const invoiceNumber = String(inv.invoice_number || invId);
    const customerName = String(inv.customer_name || 'customer');
    const status = String(inv.status || '').toLowerCase();
    const isPaid = status === 'paid';
    const open = isInvoiceOpen(inv);
    const due = new Date(inv.due_date);
    const dueTs = due.getTime();
    const isValidDue = Number.isFinite(dueTs);
    const daysUntilDue = isValidDue
      ? Math.floor((dueTs - startOfToday.getTime()) / msInDay)
      : null;
    const rateEff =
      Number(inv.exchange_rate_to_base || 0) > 0
        ? Number(inv.exchange_rate_to_base)
        : String(inv.currency || baseCode).toUpperCase() === baseCode
          ? 1
          : 1;
    const remainingBase = getInvoiceRemainingBalance(inv) * rateEff;
    const overdueCtx = {
      hasOverduePendingInstallment: (() => {
        const nextDue =
          earliestPendingDueByInvoice.get(invId) ?? String(inv.due_date ?? '').slice(0, 10);
        return (
          !!inv.use_payment_schedule &&
          !!nextDue &&
          nextDue < civilTodayYmd &&
          isInvoiceOpenForReporting({
            status: inv.status,
            total: inv.total,
            amount_paid: inv.amount_paid,
            balance_due: inv.balance_due,
            total_refunded: inv.total_refunded ?? 0,
          })
        );
      })(),
    };
    const isOverdueForTask = normalizedInvoiceMatchesDashboardOverdue(
      inv,
      earliestPendingDueByInvoice,
      civilTodayYmd
    );

    if (isOverdueForTask) {
      let overdueDays = 1;
      if (
        overdueCtx.hasOverduePendingInstallment &&
        !isValidDue
      ) {
        overdueDays = 1;
      } else if (isValidDue && daysUntilDue != null && daysUntilDue < 0) {
        overdueDays = Math.abs(daysUntilDue);
      }
      const id = `overdue-${invId}`;
      if (!seenTaskIds.has(id)) {
        seenTaskIds.add(id);
        const instLabel = overdueCtx.hasOverduePendingInstallment
          ? 'Overdue installment'
          : `Overdue ${overdueDays} day${overdueDays === 1 ? '' : 's'}`;
        taskCandidates.push({
          id,
          label: `Follow up on Invoice #${invoiceNumber} (${instLabel})`,
          href: `/dashboard/invoices/${invId}`,
          priority: 1,
        });
      }
    }
    if (!isPaid && isValidDue && daysUntilDue != null && daysUntilDue >= 0 && daysUntilDue <= 3) {
      const id = `due-soon-${invId}`;
      if (!seenTaskIds.has(id)) {
        seenTaskIds.add(id);
        taskCandidates.push({
          id,
          label:
            daysUntilDue === 0
              ? `Invoice #${invoiceNumber} due today`
              : `Invoice #${invoiceNumber} due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
          href: `/dashboard/invoices/${invId}`,
          priority: 2,
        });
      }
    }
    if (status === 'draft') {
      const id = `draft-${invId}`;
      if (!seenTaskIds.has(id)) {
        seenTaskIds.add(id);
        taskCandidates.push({
          id,
          label: `Send draft invoice to ${customerName}`,
          href: `/dashboard/invoices/${invId}/edit`,
          priority: 3,
        });
      }
    }
    if (open && remainingBase >= HIGH_VALUE_THRESHOLD) {
      const id = `high-value-${invId}`;
      if (!seenTaskIds.has(id)) {
        seenTaskIds.add(id);
        taskCandidates.push({
          id,
          label: `Review ${formatCurrencyAmount(remainingBase, business.currency)} outstanding`,
          href: `/dashboard/invoices/${invId}`,
          priority: 4,
        });
      }
    }
  }
  const nowMs = Date.now();
  for (const q of (quotesRes.data ?? []) as Array<{
    id: string;
    quote_number: string;
    status: string;
    converted_invoice_id?: string | null;
    customer_snapshot?: unknown;
    total?: number | string | null;
    currency?: string | null;
    expiry_date?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  }>) {
    const qid = String(q.id || '').trim();
    if (!qid) continue;
    const num = String(q.quote_number || qid);
    const st = String(q.status || '').toLowerCase();
    const href = `/dashboard/quotes/${qid}`;
    const cust = customerLabelFromSnapshot(q.customer_snapshot);
    const cur = String(q.currency ?? baseCode).toUpperCase();
    const amtStr = formatCurrencyAmount(Number(q.total ?? 0), cur);

    type QuoteCand = { priority: number; kind: number; id: string; label: string };
    const quoteCands: QuoteCand[] = [];

    if (st === 'accepted' && !q.converted_invoice_id) {
      quoteCands.push({
        priority: 1,
        kind: 0,
        id: `quote-convert-${qid}`,
        label: `Convert accepted quote ${num} to invoice`,
      });
    }

    if (st === 'sent') {
      const expRaw = q.expiry_date ? String(q.expiry_date).slice(0, 10) : '';
      let daysToExp: number | null = null;
      if (expRaw && /^\d{4}-\d{2}-\d{2}$/.test(expRaw)) {
        const t0 = new Date(`${civilTodayYmd}T12:00:00`).getTime();
        const t1 = new Date(`${expRaw}T12:00:00`).getTime();
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          daysToExp = Math.round((t1 - t0) / 86400000);
        }
      }
      if (daysToExp === 0) {
        quoteCands.push({
          priority: 1,
          kind: 1,
          id: `quote-exp-${qid}`,
          label: `Quote for ${cust} expires today`,
        });
      } else if (daysToExp === 1) {
        quoteCands.push({
          priority: 2,
          kind: 1,
          id: `quote-exp-${qid}`,
          label: `Quote for ${cust} expires tomorrow`,
        });
      }

      const rawU = q.updated_at || q.created_at;
      if (rawU) {
        const u = new Date(String(rawU)).getTime();
        if (Number.isFinite(u)) {
          const ageDays = (nowMs - u) / 86400000;
          if (ageDays >= QUOTE_FOLLOW_UP_DAYS) {
            const highVal =
              Number(q.total ?? 0) >= HIGH_VALUE_THRESHOLD && cur === baseCode;
            quoteCands.push({
              priority: highVal ? 2 : 3,
              kind: 2,
              id: `quote-followup-${qid}`,
              label: `Follow up on quote for ${cust} (${amtStr})`,
            });
          }
        }
      }
    }

    if (quoteCands.length === 0) continue;
    quoteCands.sort((a, b) =>
      a.priority !== b.priority ? a.priority - b.priority : a.kind - b.kind
    );
    const best = quoteCands[0];
    if (!seenTaskIds.has(best.id)) {
      seenTaskIds.add(best.id);
      taskCandidates.push({
        id: best.id,
        label: best.label,
        href,
        priority: best.priority,
      });
    }
  }
  if (taskCandidates.length === 0 && customersCount === 0) {
    taskCandidates.push({
      id: 'add-first-customer',
      label: 'Add your first customer',
      href: '/dashboard/customers',
      priority: 5,
    });
  }
  if (taskCandidates.length < 5 && expensesCount === 0) {
    taskCandidates.push({
      id: 'record-first-expense',
      label: 'Record your first expense',
      href: '/dashboard/expenses',
      priority: 5,
    });
  }
  const todayTasks = taskCandidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 10)
    .map(({ priority, ...task }) => task);
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      {searchParams?.notice === 'admin-denied' ? (
        <DashboardCard>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">You don&apos;t have access to the admin panel.</p>
        </DashboardCard>
      ) : null}
      <Suspense fallback={null}>
        <OnboardingWelcomeCelebration />
      </Suspense>
      <Suspense
        fallback={
          <div className="mb-6 h-20 animate-pulse rounded-xl border border-[var(--card-border)] bg-[var(--card)]" />
        }
      >
        <DashboardHomeHeader firstName={firstName} />
      </Suspense>

      <DashboardCard>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Quick Actions
          </h2>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
          <Link
            href={
              customersCount > 0
                ? '/dashboard/invoices/new'
                : '/dashboard/customers?add=1&return_to=/dashboard/invoices/new'
            }
            className="group inline-flex min-h-11 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-900/40"
          >
            <Receipt className="h-4 w-4 shrink-0" />
            <span>{customersCount > 0 ? 'Create invoice' : 'Add customer first'}</span>
          </Link>
          <Link
            href="/dashboard/quotes/new"
            className="group inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800/40"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span>Create Quote</span>
          </Link>
          <Link
            href="/dashboard/customers"
            className="group inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800/40"
          >
            <Users className="h-4 w-4 shrink-0" />
            <span>Add Customer</span>
          </Link>
          <Link
            href="/dashboard/expenses"
            className="group inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800/40"
          >
            <Wallet className="h-4 w-4 shrink-0" />
            <span>Record Expense</span>
          </Link>
        </div>
      </DashboardCard>

      {remainingChecklist.length > 0 && !hideDashboardSetupChecklist && (
        <DashboardCard>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Setup checklist
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {completedSteps} of {totalSteps} completed
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-2.5 text-sm">
            {remainingChecklist.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-slate-700 dark:text-slate-200">{item.label}</span>
                <Link
                  href={item.href}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-900/40"
                >
                  {item.cta}
                </Link>
              </li>
            ))}
          </ul>
        </DashboardCard>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4 xl:items-stretch">
        <DashboardCard className="flex h-full min-h-0 min-w-0 flex-col p-2.5 sm:p-3.5">
          <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-slate-500 dark:text-slate-400 sm:text-[11px]">
            {revenueKpiTitle(financialRange)}
          </p>
          <p className="mt-2 whitespace-nowrap text-sm font-semibold tabular-nums leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[1.15rem]">
            {formatCurrencyAmount(periodRevenue, business.currency)}
          </p>
          <div className="mt-2 min-w-0">
            <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
              <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">
                  Collected
              </span>
              <span className="min-w-0 truncate text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrencyAmount(periodNetCollected, business.currency)}
                </span>
              </div>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Expenses in period {formatCurrencyAmount(periodExpenses, business.currency)}{' '}
            <span className="whitespace-nowrap">↓ {Math.round(expensePctOfRevenue)}% of revenue</span>
          </p>
          {showCollectedPriorPeriodNote ? (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Collected includes payments for invoices issued in prior periods.
            </p>
          ) : null}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 transition-all duration-500 ease-out"
              style={{ width: `${periodCollectedPct}%` }}
            />
          </div>
        </DashboardCard>
        <DashboardCard className="flex h-full min-h-0 min-w-0 flex-col p-2.5 sm:p-3.5">
          <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-slate-500 dark:text-slate-400 sm:text-[11px]">
            Outstanding Invoices
          </p>
          <p className="mt-0.5 text-[9px] font-normal normal-case leading-snug tracking-normal text-slate-500 dark:text-slate-500 sm:text-[10px]">
            Current · all open invoices
          </p>
          <p className="mt-1 break-words text-base font-semibold tabular-nums leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[1.35rem]">
            {formatCurrencyAmount(outstanding, business.currency)}
          </p>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">
            {unpaidInvoiceCount} unpaid
          </p>
          {unpaidInvoiceCount > 0 && (
            <Link
              href={`/dashboard/invoices?filter=${INVOICE_MANAGEMENT_FILTER_OPEN}`}
              className="mt-1.5 inline-block text-[10px] font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 sm:text-[11px]"
            >
              View invoices
            </Link>
          )}
        </DashboardCard>
        <DashboardCard className="flex h-full min-h-0 min-w-0 flex-col p-2.5 sm:p-3.5">
          <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-slate-500 dark:text-slate-400 sm:text-[11px]">
            Overdue Payments
          </p>
          <p className="mt-0.5 text-[9px] font-normal normal-case leading-snug tracking-normal text-slate-500 dark:text-slate-500 sm:text-[10px]">
            Current · open invoices past due
          </p>
          <p className="mt-1 break-words text-base font-semibold tabular-nums leading-tight tracking-tight text-red-600 dark:text-red-400 sm:text-[1.35rem]">
            {formatCurrencyAmount(overdueTotal, business.currency)}
          </p>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">
            {overdueSnapshot.invoiceCount} Overdue
          </p>
          {overdueSnapshot.invoiceCount > 0 && (
            <Link
              href="/dashboard/invoices?status=overdue"
              className="mt-1 inline-block text-[10px] font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 sm:text-[11px]"
            >
              View invoices
            </Link>
          )}
        </DashboardCard>
        <BusinessHealthCard
          score={businessHealthScore}
          label={businessHealthLabel}
          summary={businessHealthSummary}
          periodScope={`${financialRange.label}: revenue, collections & expenses. Open balances & overdue are current totals.`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3 md:gap-6 items-start">
        <div className="flex min-h-0 flex-col gap-4 md:col-span-2">
          <DashboardCard
            className="flex min-h-0 flex-col lg:h-[290px]"
            padding={false}
          >
            <div className="shrink-0 border-b border-[var(--card-border)] px-4 py-2 sm:px-5 sm:py-2.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Recent Invoices
              </h2>
              <p className="mt-0.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                {financialRange.label} · newest in selected period
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
              <table className="app-table w-full text-left">
                <thead>
                  <tr>
                    <th className="app-th sm:px-5">
                      Invoice / Customer
                    </th>
                    <th className="app-th sm:px-5">
                      Date
                    </th>
                    <th className="app-th-num sm:px-5">
                      Amount
                    </th>
                    <th className="app-th sm:px-5">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="app-tbody">
                  {invoices.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="app-table-empty sm:px-5"
                      >
                        No invoices yet.{' '}
                        {customersCount > 0 ? (
                          <Link
                            href="/dashboard/invoices/new"
                            className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            Create one
                          </Link>
                        ) : (
                          <Link
                            href="/dashboard/customers?add=1&return_to=/dashboard/invoices/new"
                            className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            Add a customer
                          </Link>
                        )}
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="app-tr-hover transition-colors"
                      >
                        <td className="app-td sm:px-5">
                          <Link
                            href={`/dashboard/invoices/${inv.id}`}
                            className="font-medium text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-300"
                          >
                            {inv.invoice_number}
                          </Link>
                          <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                            {inv.customer_name}
                          </p>
                        </td>
                        <td className="app-td-secondary whitespace-nowrap sm:px-5">
                          {formatDisplayDate(inv.due_date)}
                        </td>
                        <td className="app-td-num whitespace-nowrap font-medium text-slate-900 dark:text-white sm:px-5">
                          <span className="block">
                            {formatMoneyCodeFirst(Number(inv.total), String((inv as { currency?: string }).currency ?? business.currency))}
                          </span>
                          {String((inv as { currency?: string }).currency ?? business.currency).toUpperCase() !==
                            baseCode && (inv as { total_in_base?: number }).total_in_base != null ? (
                            <span className="mt-0.5 block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                              {formatMoneyCodeFirst(Number((inv as { total_in_base?: number }).total_in_base), baseCode)}
                            </span>
                          ) : null}
                        </td>
                        <td className="app-td sm:px-5">
                          <span
                            className={cn(
                              'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
                              statusColors[inv.status] ??
                                'bg-slate-100 text-slate-700'
                            )}
                          >
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 border-t border-[var(--card-border)] px-4 py-2 sm:px-5">
              <Link
                href="/dashboard/invoices"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                View all invoices →
              </Link>
            </div>
          </DashboardCard>

          <div id="dashboard-revenue-card">
            <DashboardCard
              className="flex min-h-0 flex-col"
              padding={false}
            >
          <div className="shrink-0 border-b border-[var(--card-border)] px-5 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Revenue Overview
                </h2>
                <p className="mt-0.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                  {financialRange.label} · weekly buckets
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-2">
                  <span className="h-0.5 w-6 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                  Revenue
                </span>
                <span className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-0.5 w-6 rounded-full border border-dashed border-emerald-500 bg-transparent dark:border-emerald-400" />
                  Collected
                </span>
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-3.5 sm:p-4">
            <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-[var(--card-border)] bg-slate-50/80 p-2.5 sm:p-3 dark:bg-slate-900/30">
              <RevenueOverviewChart
                labels={chartLabels}
                revenue={revenueSeries}
                payments={paymentsSeries}
                baseCurrencyCode={baseCode}
                yAxisMax={chartYMax}
                footnote={`${financialRange.label} through now · ${baseCode} (stored rates). Dashed line shows gross collections; card collections reflect net after refunds.`}
              />
            </div>
          </div>
            </DashboardCard>
          </div>

          <div id="dashboard-tasks-card">
            <DashboardQuickActionsPanel tasks={todayTasks} />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4 md:col-span-1">
          <div id="dashboard-insights-card">
            <DashboardInsightsCard
              insights={dashboardInsights}
              viewAllHref={`/dashboard/insights?range=${financialRange.preset}`}
            />
          </div>
          <div id="dashboard-activity-card">
            <DashboardActivityCard
              items={activityFeed}
              viewAllHref="/dashboard/activity"
              periodSubtitle={`${financialRange.label} · payments, expenses & events`}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
