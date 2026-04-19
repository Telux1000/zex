import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DASHBOARD_OVERDUE_INVOICE_COLUMNS,
  fetchEarliestPendingDueYmdByInvoiceIds,
  logOverdueParityDebug,
  normalizedInvoiceMatchesDashboardOverdue,
  resolveCivilTodayYmdForOverdue,
} from '@/lib/invoices/dashboard-invoice-overdue';
import { nextDueYmdForPastDueUi } from '@/lib/invoices/invoice-past-due-ui';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import {
  getInvoiceBalanceDueInBase,
  isInvoiceOpenForReporting,
  normalizeInvoiceRecord,
  type NormalizedInvoiceRecord,
} from '@/lib/invoices/normalize';

const SCAN_CAP = 2000;

export type RankedOverdueFollowUpLine = {
  invoiceId: string;
  /** Display ref e.g. INV-00008 */
  label: string;
  /** User-facing reason (no scores). */
  reason: string;
};

export type RankedOverdueFollowUpResult = {
  lines: RankedOverdueFollowUpLine[];
  totalOverdue: number;
  /** Invoices matching overdue rules but not shown in `lines` (cap 5). */
  hiddenCount: number;
  invoiceScanTruncated: boolean;
};

type Scored = {
  invoiceId: string;
  label: string;
  reason: string;
  score: number;
  daysOverdue: number;
  hasInstallment: boolean;
  balanceBase: number;
};

function civilDaysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T12:00:00Z`);
  const b = Date.parse(`${toYmd}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

function bracketBalanceScore(balanceBase: number): number {
  if (balanceBase >= 25_000) return 38;
  if (balanceBase >= 10_000) return 30;
  if (balanceBase >= 2_500) return 22;
  if (balanceBase >= 500) return 14;
  if (balanceBase > 0.02) return 7;
  return 0;
}

function buildReason(args: {
  daysOverdue: number;
  hasInstallmentOverdue: boolean;
  balanceBase: number;
  hadRecentReminder: boolean;
}): string {
  const bits: string[] = [];
  if (args.hasInstallmentOverdue) {
    if (args.daysOverdue >= 1) {
      bits.push(`overdue installment · ${args.daysOverdue} days past schedule`);
    } else {
      bits.push('overdue installment');
    }
  } else if (args.daysOverdue >= 1) {
    bits.push(`${args.daysOverdue} day${args.daysOverdue === 1 ? '' : 's'} overdue`);
  }
  if (args.balanceBase >= 10_000) bits.push('high outstanding balance');
  else if (args.balanceBase >= 2_500 && bits.length === 0) bits.push('significant balance');
  if (args.hadRecentReminder && bits.length < 2) bits.push('reminder sent recently');
  if (bits.length === 0) return 'needs follow-up';
  return bits.slice(0, 2).join(' · ');
}

function scoreRow(args: {
  daysOverdue: number;
  balanceBase: number;
  hasInstallmentOverdue: boolean;
  hadRecentReminder: boolean;
  customerOverduePeers: number;
}): number {
  let s = args.daysOverdue * 2.8 + bracketBalanceScore(args.balanceBase);
  if (args.hasInstallmentOverdue) s += 32;
  if (args.hadRecentReminder) s -= 22;
  if (args.customerOverduePeers >= 2) s += 12;
  return s;
}

/**
 * Load overdue invoices (dashboard rules: open balance + past due or overdue installment),
 * score for follow-up priority, and return top bands. Scores are internal only.
 */
export async function fetchRankedOverdueFollowUps(
  supabase: SupabaseClient,
  businessId: string,
  reportingCurrency: string,
  workspaceTimezone: string | null | undefined
): Promise<RankedOverdueFollowUpResult> {
  const tz = (workspaceTimezone && workspaceTimezone.trim()) || 'UTC';
  const civilTodayYmd = resolveCivilTodayYmdForOverdue(new Date(), tz);
  const baseCode = (reportingCurrency || 'USD').trim().toUpperCase() || 'USD';

  const { data, error } = await supabase
    .from('invoices')
    .select(DASHBOARD_OVERDUE_INVOICE_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(SCAN_CAP);

  if (error) {
    console.error('[assistant-overdue-priority] invoice_fetch', error.message);
    return { lines: [], totalOverdue: 0, hiddenCount: 0, invoiceScanTruncated: false };
  }

  const rawRows = (data ?? []) as Record<string, unknown>[];
  const invoiceScanTruncated = rawRows.length >= SCAN_CAP;
  const ids = rawRows.map((r) => String(r.id ?? '')).filter(Boolean);

  const earliestPendingDueByInvoice =
    ids.length > 0 ? await fetchEarliestPendingDueYmdByInvoiceIds(supabase, ids) : new Map<string, string>();

  const reminderLastSent = new Map<string, string>();
  if (ids.length > 0) {
    const { data: logRows, error: logErr } = await supabase
      .from('invoice_reminder_sent_log')
      .select('invoice_id, sent_at')
      .eq('business_id', businessId)
      .in('invoice_id', ids)
      .order('sent_at', { ascending: false })
      .limit(8000);
    if (logErr) {
      console.error('[assistant-overdue-priority] reminder_log_fetch', logErr.message);
    } else {
      for (const lr of logRows ?? []) {
        const row = lr as { invoice_id?: string; sent_at?: string };
        const iid = String(row.invoice_id ?? '');
        if (!iid || reminderLastSent.has(iid)) continue;
        const sa = row.sent_at != null ? String(row.sent_at) : '';
        if (sa) reminderLastSent.set(iid, sa);
      }
    }
  }

  type Candidate = {
    inv: NormalizedInvoiceRecord;
    derivedStatus: string;
    hasInst: boolean;
    refDueYmd: string;
    daysOverdue: number;
  };

  const candidates: Candidate[] = [];

  for (const r of rawRows) {
    const inv = normalizeInvoiceRecord(r, baseCode);
    if (!inv) continue;
    if (!normalizedInvoiceMatchesDashboardOverdue(inv, earliestPendingDueByInvoice, civilTodayYmd)) continue;

    const derivedStatus = deriveInvoiceStatus({
      status: inv.status,
      total: inv.total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due,
      total_refunded: inv.total_refunded ?? 0,
    });
    const nextDue = nextDueYmdForPastDueUi(inv, earliestPendingDueByInvoice);
    const openRep = isInvoiceOpenForReporting({
      status: derivedStatus,
      total: inv.total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due,
      total_refunded: inv.total_refunded ?? 0,
    });
    const hasInst =
      !!inv.use_payment_schedule &&
      !!nextDue &&
      nextDue < civilTodayYmd &&
      openRep;

    let refDueYmd = inv.due_date ? String(inv.due_date).slice(0, 10) : civilTodayYmd;
    if (hasInst) {
      if (nextDue && (!refDueYmd || nextDue < refDueYmd)) refDueYmd = nextDue;
    }

    const daysOverdue = civilDaysBetweenYmd(refDueYmd, civilTodayYmd);
    candidates.push({ inv, derivedStatus, hasInst, refDueYmd, daysOverdue });
  }

  /** Per-customer count for “importance” proxy (multiple open overdue). */
  const overduePerCustomer = new Map<string, number>();
  for (const c of candidates) {
    const cid = c.inv.customer_id?.trim();
    if (!cid) continue;
    overduePerCustomer.set(cid, (overduePerCustomer.get(cid) ?? 0) + 1);
  }

  const scored: Scored[] = [];

  for (const c of candidates) {
    const balBase = getInvoiceBalanceDueInBase(c.inv);
    const last = reminderLastSent.get(c.inv.id);
    let hadRecentReminder = false;
    if (last) {
      const t = Date.parse(last);
      if (Number.isFinite(t)) {
        const ageH = (Date.now() - t) / (60 * 60 * 1000);
        if (ageH <= 72) hadRecentReminder = true;
      }
    }
    const cid = c.inv.customer_id?.trim() ?? '';
    const peers = cid ? overduePerCustomer.get(cid) ?? 0 : 0;

    const sc = scoreRow({
      daysOverdue: Math.max(c.daysOverdue, c.hasInst ? 1 : 0),
      balanceBase: balBase,
      hasInstallmentOverdue: c.hasInst,
      hadRecentReminder,
      customerOverduePeers: peers,
    });

    const displayNum = (c.inv.invoice_number || '').trim() || c.inv.id.slice(0, 8);
    const reason = buildReason({
      daysOverdue: Math.max(c.daysOverdue, c.hasInst && c.daysOverdue === 0 ? 1 : 0),
      hasInstallmentOverdue: c.hasInst,
      balanceBase: balBase,
      hadRecentReminder,
    });

    const d = Math.max(c.daysOverdue, c.hasInst && c.daysOverdue === 0 ? 1 : 0);
    scored.push({
      invoiceId: c.inv.id,
      label: displayNum,
      reason,
      score: sc,
      daysOverdue: d,
      hasInstallment: c.hasInst,
      balanceBase: balBase,
    });
  }

  /** Primary: most days overdue; then installment-critical; then balance; score last. */
  scored.sort((a, b) => {
    if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
    if (Number(b.hasInstallment) !== Number(a.hasInstallment)) {
      return Number(b.hasInstallment) - Number(a.hasInstallment);
    }
    if (b.balanceBase !== a.balanceBase) return b.balanceBase - a.balanceBase;
    return b.score - a.score;
  });

  const totalOverdue = scored.length;
  const maxLines = 5;
  const lines: RankedOverdueFollowUpLine[] = scored.slice(0, maxLines).map(({ score: _s, daysOverdue: _d, hasInstallment: _h, balanceBase: _b, ...rest }) => rest);

  const hiddenCount = Math.max(0, totalOverdue - lines.length);

  logOverdueParityDebug({
    surface: 'assistant_ranked_overdue',
    overdueCount: totalOverdue,
    civilTodayYmd,
    scanTruncated: invoiceScanTruncated,
    extra: { businessId },
  });

  return {
    lines,
    totalOverdue,
    hiddenCount,
    invoiceScanTruncated,
  };
}

/** Per-customer roll-up for collections follow-up (overdue first, then open unpaid). */
export type CollectionsIntelligenceCustomerRow = {
  displayName: string;
  totalOutstandingBase: number;
  invoiceCount: number;
  /** Max days past due across invoices in reporting currency bucket (0 if not overdue). */
  maxDaysOverdue: number;
  hasOverdue: boolean;
};

function customerKeyForCollections(inv: NormalizedInvoiceRecord): string {
  const cid = inv.customer_id?.trim();
  if (cid) return `id:${cid}`;
  return `name:${(inv.customer_name || '').trim().toLowerCase()}`;
}

/**
 * Customers to prioritize for collections: aggregate open balances, rank overdue before
 * not-yet-due unpaid; then by total outstanding (desc), then max days overdue (desc).
 */
export async function fetchCollectionsIntelligenceByCustomer(
  supabase: SupabaseClient,
  businessId: string,
  reportingCurrency: string,
  workspaceTimezone: string | null | undefined
): Promise<{ rows: CollectionsIntelligenceCustomerRow[]; invoiceScanTruncated: boolean }> {
  const tz = (workspaceTimezone && workspaceTimezone.trim()) || 'UTC';
  const civilTodayYmd = resolveCivilTodayYmdForOverdue(new Date(), tz);
  const baseCode = (reportingCurrency || 'USD').trim().toUpperCase() || 'USD';

  const { data, error } = await supabase
    .from('invoices')
    .select(DASHBOARD_OVERDUE_INVOICE_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(SCAN_CAP);

  if (error) {
    console.error('[assistant-overdue-priority] collections_fetch', error.message);
    return { rows: [], invoiceScanTruncated: false };
  }

  const rawRows = (data ?? []) as Record<string, unknown>[];
  const invoiceScanTruncated = rawRows.length >= SCAN_CAP;
  const ids = rawRows.map((r) => String(r.id ?? '')).filter(Boolean);

  const earliestPendingDueByInvoice =
    ids.length > 0 ? await fetchEarliestPendingDueYmdByInvoiceIds(supabase, ids) : new Map<string, string>();

  type Cand = {
    inv: NormalizedInvoiceRecord;
    daysOverdue: number;
    hasInst: boolean;
  };

  const overdueCandidates: Cand[] = [];

  for (const r of rawRows) {
    const inv = normalizeInvoiceRecord(r, baseCode);
    if (!inv) continue;
    if (!normalizedInvoiceMatchesDashboardOverdue(inv, earliestPendingDueByInvoice, civilTodayYmd)) continue;

    const derivedStatus = deriveInvoiceStatus({
      status: inv.status,
      total: inv.total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due,
      total_refunded: inv.total_refunded ?? 0,
    });
    const nextDue = nextDueYmdForPastDueUi(inv, earliestPendingDueByInvoice);
    const openRep = isInvoiceOpenForReporting({
      status: derivedStatus,
      total: inv.total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due,
      total_refunded: inv.total_refunded ?? 0,
    });
    const hasInst =
      !!inv.use_payment_schedule && !!nextDue && nextDue < civilTodayYmd && openRep;

    let refDueYmd = inv.due_date ? String(inv.due_date).slice(0, 10) : civilTodayYmd;
    if (hasInst) {
      if (nextDue && (!refDueYmd || nextDue < refDueYmd)) refDueYmd = nextDue;
    }

    const daysOverdue = civilDaysBetweenYmd(refDueYmd, civilTodayYmd);
    overdueCandidates.push({ inv, daysOverdue, hasInst });
  }

  const overdueIds = new Set(overdueCandidates.map((c) => c.inv.id));
  const agg = new Map<
    string,
    { displayName: string; totalOutstandingBase: number; invoiceCount: number; maxDaysOverdue: number; hasOverdue: boolean }
  >();

  function bump(
    inv: NormalizedInvoiceRecord,
    balBase: number,
    daysOverdue: number,
    hasOverdue: boolean
  ) {
    if (balBase <= 0.02) return;
    const key = customerKeyForCollections(inv);
    const displayName = (inv.customer_name || '').trim() || 'Unknown customer';
    const d = Math.max(daysOverdue, hasOverdue && daysOverdue === 0 ? 1 : 0);
    const prev = agg.get(key) ?? {
      displayName,
      totalOutstandingBase: 0,
      invoiceCount: 0,
      maxDaysOverdue: 0,
      hasOverdue: false,
    };
    prev.displayName = displayName || prev.displayName;
    prev.totalOutstandingBase += balBase;
    prev.invoiceCount += 1;
    prev.maxDaysOverdue = Math.max(prev.maxDaysOverdue, d);
    prev.hasOverdue = prev.hasOverdue || hasOverdue;
    agg.set(key, prev);
  }

  for (const c of overdueCandidates) {
    const balBase = getInvoiceBalanceDueInBase(c.inv);
    const d = Math.max(c.daysOverdue, c.hasInst && c.daysOverdue === 0 ? 1 : 0);
    bump(c.inv, balBase, d, true);
  }

  for (const r of rawRows) {
    const inv = normalizeInvoiceRecord(r, baseCode);
    if (!inv) continue;
    if (overdueIds.has(inv.id)) continue;

    const derivedStatus = deriveInvoiceStatus({
      status: inv.status,
      total: inv.total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due,
      total_refunded: inv.total_refunded ?? 0,
    });
    if (
      !isInvoiceOpenForReporting({
        status: derivedStatus,
        total: inv.total,
        amount_paid: inv.amount_paid,
        balance_due: inv.balance_due,
        total_refunded: inv.total_refunded ?? 0,
      })
    ) {
      continue;
    }
    if (normalizedInvoiceMatchesDashboardOverdue(inv, earliestPendingDueByInvoice, civilTodayYmd)) continue;

    const balBase = getInvoiceBalanceDueInBase(inv);
    bump(inv, balBase, 0, false);
  }

  const rows: CollectionsIntelligenceCustomerRow[] = Array.from(agg.values()).map((v) => ({
    displayName: v.displayName,
    totalOutstandingBase: v.totalOutstandingBase,
    invoiceCount: v.invoiceCount,
    maxDaysOverdue: v.maxDaysOverdue,
    hasOverdue: v.hasOverdue,
  }));

  rows.sort((a, b) => {
    if (Number(b.hasOverdue) !== Number(a.hasOverdue)) return Number(b.hasOverdue) - Number(a.hasOverdue);
    if (b.totalOutstandingBase !== a.totalOutstandingBase)
      return b.totalOutstandingBase - a.totalOutstandingBase;
    return b.maxDaysOverdue - a.maxDaysOverdue;
  });

  return { rows, invoiceScanTruncated };
}
