import { cookies } from 'next/headers';
import { DASHBOARD_TZ_COOKIE } from '@/lib/dashboard/date-range';
import { logOverdueParityDebug } from '@/lib/invoices/dashboard-invoice-overdue';
import { computeInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { resolvePastDueCivilTodayYmd, invoiceMatchesPastDueUi } from '@/lib/invoices/invoice-past-due-ui';
import { normalizeInvoiceRecord, isInvoiceOpenForReporting } from '@/lib/invoices/normalize';
import {
  applyRefundDisplayStatus,
  availableRefundableAmount,
  canShowRefundMenuAction,
  normalizeCurrencyForRefund,
  resolveRefundDisplayStatus,
  succeededPaymentGrossInInvoiceCurrency,
} from '@/lib/invoices/refund-display';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type InvoiceListUrlParams,
  invoiceListUsesDatabasePagination,
  applyInvoiceListBaseFilters,
  applyInvoiceListSort,
  invoiceListEstimatedCountQuery,
  invoiceListExactCountQuery,
} from '@/lib/invoices/invoice-list-sql-path';

const MAX_INVOICE_LIST_PAGE_SIZE = 100;

type InvoiceListRowPastDueInput = {
  id: string;
  status: string;
  due_date: string;
  balance_due: number;
  total: number;
  amount_paid: number;
  total_refunded?: number;
  use_payment_schedule: boolean;
  next_due_date: string | null;
};

function listRowMatchesPartiallyPaidFilter(inv: InvoiceListRowPastDueInput): boolean {
  const raw = String(inv.status ?? '').toLowerCase();
  if (raw === 'voided' || raw === 'cancelled' || raw === 'draft') return false;
  const derived = deriveInvoiceStatus({
    status: inv.status,
    total: inv.total,
    amount_paid: inv.amount_paid,
    balance_due: inv.balance_due,
    total_refunded: inv.total_refunded ?? 0,
  });
  return derived === 'partially_paid' || derived === 'partially_refunded';
}

function invoiceApiRowMatchesPastDue(inv: InvoiceListRowPastDueInput, civilTodayYmd: string): boolean {
  const nextDueYmd = String(inv.next_due_date ?? inv.due_date ?? '').slice(0, 10);
  return invoiceMatchesPastDueUi(
    {
      id: inv.id,
      status: inv.status,
      due_date: inv.due_date,
      balance_due: inv.balance_due,
      total: inv.total,
      amount_paid: inv.amount_paid,
      use_payment_schedule: inv.use_payment_schedule,
      total_refunded: inv.total_refunded ?? 0,
    },
    civilTodayYmd,
    nextDueYmd
  );
}

function numField(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type InvoiceListDataPipelineRow = Record<string, unknown>;
export type ListPerf = { mark: (name: string) => void };

type PipelineModeList = {
  kind: 'list';
  page: number;
  pageSize: number;
  wantExactCount: boolean;
  perf: ListPerf;
  selectPrimary: string;
  selectLegacy: string;
};

type PipelineModeExport = {
  kind: 'export_csv';
  maxRows: number;
  selectPrimary: string;
  selectLegacy: string;
  perf: ListPerf | null;
};

type RunPipelineArgs = {
  supabase: SupabaseClient;
  business: { id: string; currency?: string | null };
  listParams: InvoiceListUrlParams;
  mode: PipelineModeList | PipelineModeExport;
};

/**
 * Fetches, filters, and sorts the invoice list (or export slice) and applies refund / paid display
 * enrichment, matching GET /api/invoices, **before** recurring and reminder next-run metadata.
 */
export async function runInvoiceListDataPipeline(
  args: RunPipelineArgs
): Promise<
  | { ok: false; error: { message: string } }
  | {
      ok: true;
      /** Rows match list API / table display amounts and status. */
      invoices: InvoiceListDataPipelineRow[];
      totalCount: number;
      useDbPage: boolean;
      /** Set when the export is capped to maxRows. */
      exportCapped: boolean;
    }
> {
  const { supabase, business, listParams, mode } = args;
  const status = listParams.status;
  const schedule_filter = listParams.schedule_filter;
  const filter = listParams.filter;
  const balance = listParams.balance;
  const sort = listParams.sort;
  const order = listParams.order;

  const isExport = mode.kind === 'export_csv';
  const mark = (name: string) => mode.perf?.mark(name);

  const useDbPage = invoiceListUsesDatabasePagination(listParams);

  const page = mode.kind === 'list' ? Math.max(1, mode.page) : 1;
  const page_size = mode.kind === 'list' ? mode.pageSize : MAX_INVOICE_LIST_PAGE_SIZE;
  const wantExactCount = mode.kind === 'list' ? mode.wantExactCount : false;
  const maxExportRows = mode.kind === 'export_csv' ? mode.maxRows : 0;

  const listSelectPrimary = mode.selectPrimary;
  const listSelectLegacy = mode.selectLegacy;

  let rows: Record<string, unknown>[] | null = null;
  let error: { message?: string } | null = null;
  let totalCount = 0;
  let exportCapped = false;

  if (useDbPage) {
    const from = (page - 1) * page_size;
    const to = from + page_size - 1;
    let dataQuery = applyInvoiceListBaseFilters(
      supabase,
      business.id,
      listSelectPrimary,
      listParams,
      { applyStatusInSql: true }
    );
    dataQuery = applyInvoiceListSort(dataQuery, sort, order);
    if (isExport) {
      mark('invoice_list_query');
      let pageRes = await dataQuery.limit(maxExportRows);
      if (pageRes.error && /column .* does not exist/i.test(pageRes.error.message || '')) {
        let dq = applyInvoiceListBaseFilters(
          supabase,
          business.id,
          listSelectLegacy,
          listParams,
          { applyStatusInSql: true }
        );
        dq = applyInvoiceListSort(dq, sort, order);
        pageRes = await dq.limit(maxExportRows);
      }
      rows = (pageRes.data ?? null) as Record<string, unknown>[] | null;
      error = pageRes.error;
      if (!error && (rows?.length ?? 0) === maxExportRows) {
        exportCapped = true;
      }
    } else {
      const countBuilder = wantExactCount
        ? invoiceListExactCountQuery(supabase, business.id, listParams, true)
        : invoiceListEstimatedCountQuery(supabase, business.id, listParams, true);
      const dataBuilder = dataQuery.range(from, to);
      mark('count_query');
      let [countRes, pageRes] = await Promise.all([countBuilder, dataBuilder]);
      mark('invoice_list_query');
      if (pageRes.error && /column .* does not exist/i.test(pageRes.error.message || '')) {
        let dq = applyInvoiceListBaseFilters(
          supabase,
          business.id,
          listSelectLegacy,
          listParams,
          { applyStatusInSql: true }
        );
        dq = applyInvoiceListSort(dq, sort, order);
        pageRes = await dq.range(from, to);
      }
      rows = (pageRes.data ?? null) as Record<string, unknown>[] | null;
      error = pageRes.error;
      const est = countRes.count;
      const loaded = rows?.length ?? 0;
      if (wantExactCount && !countRes.error) {
        totalCount = typeof est === 'number' ? est : 0;
      } else {
        if (countRes.error && wantExactCount && process.env.NODE_ENV === 'development') {
          console.warn(
            '[invoice list] exact_count head failed, using estimated heuristic',
            countRes.error?.message
          );
        }
        if (loaded === 0 && page === 1) {
          totalCount = 0;
        } else {
          totalCount = Math.max(typeof est === 'number' ? est : 0, from + loaded);
        }
      }
    }
  } else {
    mark('invoice_list_query');
    let query = applyInvoiceListBaseFilters(
      supabase,
      business.id,
      listSelectPrimary,
      listParams,
      { applyStatusInSql: false }
    );
    query = query.order('created_at', { ascending: false });
    let res = await query;
    if (res.error && /column .* does not exist/i.test(res.error.message || '')) {
      let legacyQuery = applyInvoiceListBaseFilters(
        supabase,
        business.id,
        listSelectLegacy,
        listParams,
        { applyStatusInSql: false }
      );
      legacyQuery = legacyQuery.order('created_at', { ascending: false });
      res = await legacyQuery;
    }
    rows = (res.data ?? null) as Record<string, unknown>[] | null;
    error = res.error;
    mark('count_query');
  }

  if (error) {
    return { ok: false, error: { message: error.message ?? 'Query failed' } };
  }

  const customerIdsForReminders = new Set<string>();
  for (const raw of rows ?? []) {
    const rawRow = raw as Record<string, unknown>;
    const useDef = rawRow.use_customer_reminder_defaults;
    const cid = rawRow.customer_id;
    if (useDef !== false && cid != null && String(cid).trim() !== '') {
      customerIdsForReminders.add(String(cid));
    }
  }
  const customerReminderById = new Map<string, unknown>();
  if (customerIdsForReminders.size > 0) {
    const { data: custRows } = await supabase
      .from('customers')
      .select('id, reminder_settings')
      .eq('business_id', business.id)
      .in('id', [...customerIdsForReminders]);
    for (const c of custRows ?? []) {
      const id = String((c as { id?: string }).id ?? '');
      if (id) customerReminderById.set(id, (c as { reminder_settings?: unknown }).reminder_settings ?? null);
    }
  }

  const invoiceIds = (rows ?? []).map((r) => String((r as { id: unknown }).id));
  const pendingByInvoice = new Map<string, { next_due_date: string | null; remaining_installments: number }>();
  if (invoiceIds.length > 0) {
    const { data: pendingRows } = await supabase
      .from('invoice_payment_schedule_items')
      .select('invoice_id, due_date, status')
      .in('invoice_id', invoiceIds)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    for (const row of pendingRows ?? []) {
      const invId = String((row as { invoice_id?: string }).invoice_id);
      const curr = pendingByInvoice.get(invId);
      if (!curr) {
        pendingByInvoice.set(invId, {
          next_due_date: String((row as { due_date?: string | null }).due_date ?? ''),
          remaining_installments: 1,
        });
      } else {
        pendingByInvoice.set(invId, {
          next_due_date: curr.next_due_date,
          remaining_installments: curr.remaining_installments + 1,
        });
      }
    }
  }

  const baseCurrency = String((business as { currency?: string }).currency ?? 'USD').toUpperCase();
  let invoices = (rows ?? [])
    .map((raw) => {
      const r = normalizeInvoiceRecord(raw as Record<string, unknown>, baseCurrency);
      if (!r) return null;
      const rr = (raw as { recurring_rule_id?: string | null }).recurring_rule_id;
      const recurring_rule_id =
        rr != null && String(rr).trim() !== '' ? String(rr) : null;
      const pending = pendingByInvoice.get(String(r.id));
      const amountPaid = Number(r.amount_paid ?? 0);
      const rawSt = String(r.status ?? '').toLowerCase();
      const totalRefunded = Number((raw as { total_refunded?: number | null }).total_refunded ?? 0);
      const balanceDue =
        rawSt === 'voided' || rawSt === 'cancelled'
          ? 0
          : computeInvoiceBalanceDue(Number(r.total), amountPaid, totalRefunded);
      const rawRow = raw as Record<string, unknown>;
      const cidRem = r.customer_id != null ? String(r.customer_id) : '';
      const customerReminderSettings =
        cidRem && customerReminderById.has(cidRem) ? (customerReminderById.get(cidRem) ?? null) : null;
      const useCustomerReminderDefaults =
        rawRow.use_customer_reminder_defaults !== undefined
          ? (rawRow.use_customer_reminder_defaults as boolean) !== false
          : undefined;
      return {
        id: r.id,
        invoice_number: r.invoice_number,
        customer_name: r.customer_name,
        customer_id: r.customer_id,
        customer_email: r.customer_email,
        reference_po: r.reference_po,
        currency: r.currency,
        issue_date: r.issue_date,
        subtotal: r.subtotal,
        tax_amount: r.tax_amount,
        discount_amount: numField((raw as { discount_amount?: unknown }).discount_amount),
        total: Number(r.total),
        total_in_base: Number(r.total_in_base ?? 0),
        exchange_rate_to_base: Number(r.exchange_rate_to_base ?? 0),
        amount_paid: amountPaid,
        balance_due: balanceDue,
        total_refunded: totalRefunded,
        use_payment_schedule: !!r.use_payment_schedule,
        next_due_date: pending?.next_due_date ?? r.due_date,
        remaining_installments: pending?.remaining_installments ?? 0,
        status: deriveInvoiceStatus({
          status: r.status,
          total: Number(r.total ?? 0),
          amount_paid: amountPaid,
          balance_due: balanceDue,
          total_refunded: totalRefunded,
        }),
        due_date: r.due_date,
        paid_at: r.paid_at ?? null,
        created_at: r.created_at,
        recurring_rule_id,
        scheduled_send_at: (rawRow as { scheduled_send_at?: string | null }).scheduled_send_at ?? null,
        ...(useCustomerReminderDefaults !== undefined
          ? {
              use_customer_reminder_defaults: useCustomerReminderDefaults,
              reminder_settings: rawRow.reminder_settings ?? null,
              customer_reminder_settings: customerReminderSettings,
            }
          : {}),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const cookieStore = await cookies();
  const tzRaw = cookieStore.get(DASHBOARD_TZ_COOKIE)?.value;
  let workspaceTz: string | null = null;
  try {
    workspaceTz = tzRaw ? decodeURIComponent(tzRaw) : null;
  } catch {
    workspaceTz = tzRaw ?? null;
  }
  const today = resolvePastDueCivilTodayYmd(new Date(), workspaceTz);

  if (!useDbPage) {
    if (status) {
      if (status === 'overdue') {
        invoices = invoices.filter((inv) => invoiceApiRowMatchesPastDue(inv, today));
      } else if (status === 'cancelled') {
        invoices = invoices.filter(
          (inv) => inv.status === 'cancelled' || inv.status === 'voided'
        );
      } else if (status === 'pending') {
        invoices = invoices.filter((inv) => inv.status === 'pending' || inv.status === 'sent');
      } else if (status === 'partially_paid') {
        invoices = invoices.filter((inv) => listRowMatchesPartiallyPaidFilter(inv));
      } else {
        invoices = invoices.filter((inv) => inv.status === status);
      }
    }

    if (filter === 'open' || balance === 'open') {
      invoices = invoices.filter((inv) =>
        isInvoiceOpenForReporting({
          status: inv.status,
          total: inv.total,
          amount_paid: inv.amount_paid,
          balance_due: inv.balance_due,
          total_refunded: inv.total_refunded ?? 0,
        })
      );
    }

    if (schedule_filter === 'with_schedule') {
      invoices = invoices.filter((inv) => !!inv.use_payment_schedule);
    } else if (schedule_filter === 'due_today') {
      invoices = invoices.filter(
        (inv) => String(inv.next_due_date || inv.due_date || '').slice(0, 10) === today
      );
    } else if (schedule_filter === 'upcoming') {
      invoices = invoices.filter(
        (inv) => String(inv.next_due_date || inv.due_date || '').slice(0, 10) > today
      );
    } else if (schedule_filter === 'past_due') {
      invoices = invoices.filter((inv) => invoiceApiRowMatchesPastDue(inv, today));
    }

    if (status === 'overdue' || schedule_filter === 'past_due') {
      logOverdueParityDebug({
        surface: isExport ? 'invoice_csv_export' : 'invoice_api_list',
        overdueCount: invoices.length,
        civilTodayYmd: today,
        extra: { businessId: business.id, status: status || null, schedule_filter: schedule_filter || null },
      });
    }

    const normalizedSort = sort === 'default' ? 'created_at' : sort;
    const compareDate = (a: string | null | undefined, b: string | null | undefined) =>
      (a || '').localeCompare(b || '');
    const compareText = (a: string | null | undefined, b: string | null | undefined) =>
      (a || '').localeCompare(b || '');
    const statusRank = (value: string) => {
      const v = value === 'overdue' ? 'overdue' : value;
      if (v === 'draft') return 0;
      if (v === 'pending') return 1;
      if (v === 'sent') return 2;
      if (v === 'overdue') return 3;
      if (v === 'partially_paid') return 4;
      if (v === 'paid') return 5;
      if (v === 'cancelled' || v === 'voided') return 6;
      return 99;
    };

    invoices.sort((a, b) => {
      let base = 0;
      if (normalizedSort === 'next_due' || normalizedSort === 'due_date') {
        base = compareDate(a.next_due_date || a.due_date, b.next_due_date || b.due_date);
      } else if (normalizedSort === 'issue_date') {
        base = compareDate(a.issue_date, b.issue_date);
      } else if (normalizedSort === 'amount') {
        base = Number(a.balance_due ?? a.total) - Number(b.balance_due ?? b.total);
      } else if (normalizedSort === 'total') {
        base = Number(a.total) - Number(b.total);
      } else if (normalizedSort === 'status') {
        const aNext = String(a.next_due_date || a.due_date || '').slice(0, 10);
        const bNext = String(b.next_due_date || b.due_date || '').slice(0, 10);
        const aStatus =
          a.status === 'paid' || a.status === 'voided' || a.status === 'cancelled' || a.status === 'partially_paid'
            ? a.status
            : a.due_date && aNext < today
              ? 'overdue'
              : a.status;
        const bStatus =
          b.status === 'paid' || b.status === 'voided' || b.status === 'cancelled' || b.status === 'partially_paid'
            ? b.status
            : b.due_date && bNext < today
              ? 'overdue'
              : b.status;
        base = statusRank(aStatus) - statusRank(bStatus);
      } else if (normalizedSort === 'created_at') {
        base = compareDate(a.created_at, b.created_at);
      } else if (normalizedSort === 'number') {
        base = compareText(a.invoice_number, b.invoice_number);
      } else if (normalizedSort === 'customer') {
        base = compareText(a.customer_name, b.customer_name);
      } else {
        base = compareDate(a.created_at, b.created_at);
      }
      return order === 'asc' ? base : -base;
    });

    totalCount = invoices.length;
    if (isExport) {
      const nBefore = invoices.length;
      if (nBefore > maxExportRows) {
        exportCapped = true;
      }
      invoices = invoices.slice(0, maxExportRows);
    } else {
      const from = (page - 1) * page_size;
      const to = from + page_size;
      invoices = invoices.slice(from, to);
    }
  } else if (isExport) {
    totalCount = invoices.length;
  }

  mark('enrichment');

  const pageIds = invoices.map((inv) => inv.id);
  const refundedByInvoice = new Map<string, number>();
  const grossPaidByInvoice = new Map<string, number>();
  const latestSucceededPaymentByInvoice = new Map<string, string>();
  if (pageIds.length > 0) {
    const { data: refundRows } = await supabase
      .from('payment_refunds')
      .select('invoice_id, amount, status')
      .in('invoice_id', pageIds);
    for (const row of refundRows ?? []) {
      const st = String((row as { status?: string }).status ?? '').toLowerCase();
      if (st !== 'succeeded' && st !== 'pending') continue;
      const invoiceId = String((row as { invoice_id?: string }).invoice_id ?? '');
      if (!invoiceId) continue;
      const amount = Number((row as { amount?: number }).amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      refundedByInvoice.set(invoiceId, (refundedByInvoice.get(invoiceId) ?? 0) + amount);
    }
    const { data: succeededPaymentRows } = await supabase
      .from('payments')
      .select('invoice_id, amount, amount_in_invoice_currency, currency, paid_at, created_at')
      .in('invoice_id', pageIds)
      .eq('status', 'succeeded');
    const invCurrencyById = new Map(
      invoices.map((inv) => [String(inv.id), normalizeCurrencyForRefund((inv as { currency?: string }).currency)])
    );
    for (const row of succeededPaymentRows ?? []) {
      const invoiceId = String((row as { invoice_id?: string }).invoice_id ?? '');
      if (!invoiceId) continue;
      const invCur = invCurrencyById.get(invoiceId) ?? 'USD';
      const chunk = succeededPaymentGrossInInvoiceCurrency(
        {
          amount: (row as { amount?: number | null }).amount,
          amount_in_invoice_currency: (row as { amount_in_invoice_currency?: number | null })
            .amount_in_invoice_currency,
          currency: (row as { currency?: string | null }).currency,
        },
        invCur
      );
      if (chunk > 0) {
        grossPaidByInvoice.set(invoiceId, (grossPaidByInvoice.get(invoiceId) ?? 0) + chunk);
      }
      const touch =
        (row as { paid_at?: string | null; created_at?: string | null }).paid_at ??
        (row as { created_at?: string | null }).created_at ??
        null;
      if (!touch) continue;
      const ts = Date.parse(String(touch));
      if (!Number.isFinite(ts)) continue;
      const prev = latestSucceededPaymentByInvoice.get(invoiceId);
      if (!prev || Date.parse(prev) < ts) latestSucceededPaymentByInvoice.set(invoiceId, String(touch));
    }
  }

  const paidOrPartialIds = invoices
    .filter((inv) => inv.status === 'paid' || inv.status === 'partially_paid')
    .map((inv) => inv.id);
  const latestSchedulePaidByInvoice = new Map<string, string>();
  if (paidOrPartialIds.length > 0) {
    const { data: schedPaidRows } = await supabase
      .from('invoice_payment_schedule_items')
      .select('invoice_id, paid_at')
      .in('invoice_id', paidOrPartialIds)
      .eq('status', 'paid');
    for (const row of schedPaidRows ?? []) {
      const invId = String((row as { invoice_id?: string }).invoice_id ?? '');
      const pa = (row as { paid_at?: string | null }).paid_at;
      if (!invId || pa == null || String(pa).trim() === '') continue;
      const ts = Date.parse(String(pa));
      if (!Number.isFinite(ts)) continue;
      const prev = latestSchedulePaidByInvoice.get(invId);
      if (!prev || Date.parse(prev) < ts) latestSchedulePaidByInvoice.set(invId, String(pa));
    }
  }

  function maxPaymentTouch(a: string | null | undefined, b: string | null | undefined): string | null {
    const ta = a != null && String(a).trim() !== '' ? Date.parse(String(a)) : NaN;
    const tb = b != null && String(b).trim() !== '' ? Date.parse(String(b)) : NaN;
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return null;
    if (!Number.isFinite(ta)) return String(b);
    if (!Number.isFinite(tb)) return String(a);
    return ta >= tb ? String(a) : String(b);
  }

  const enriched = invoices.map((inv) => {
    const rawStatusForRefund = String(inv.status ?? '').toLowerCase();
    const fromPayments = latestSucceededPaymentByInvoice.get(inv.id) ?? null;
    const fromSchedule = latestSchedulePaidByInvoice.get(inv.id) ?? null;
    const latestActivity = maxPaymentTouch(fromPayments, fromSchedule);

    const amountPaidOnInvoice = Number(inv.amount_paid ?? 0);
    const grossFromPaymentRows = grossPaidByInvoice.get(inv.id) ?? 0;
    const grossPaidAmount = amountPaidOnInvoice > 0.0001 ? amountPaidOnInvoice : grossFromPaymentRows;

    const refundStatus = resolveRefundDisplayStatus({
      grossPaidAmount,
      refundedAmount: refundedByInvoice.get(inv.id) ?? 0,
    });
    const displayStatus = applyRefundDisplayStatus(inv.status, refundStatus);
    const refundedAmount = refundedByInvoice.get(inv.id) ?? 0;
    const netPaidAmount = Math.max(0, grossPaidAmount - refundedAmount);
    const available_refundable_amount = availableRefundableAmount(grossPaidAmount, refundedAmount);
    const refund_action_eligible = canShowRefundMenuAction({
      status: rawStatusForRefund,
      grossPaidSucceeded: grossPaidAmount,
      refundedSucceededAndPending: refundedAmount,
    });

    if (inv.status === 'paid') {
      return {
        ...inv,
        status: displayStatus,
        refunded_amount: refundedAmount,
        gross_paid_amount: grossPaidAmount,
        net_paid_amount: netPaidAmount,
        available_refundable_amount,
        refund_action_eligible,
        paid_at: inv.paid_at ?? latestActivity ?? null,
      } as Record<string, unknown>;
    }
    if (inv.status === 'partially_paid') {
      return {
        ...inv,
        status: displayStatus,
        refunded_amount: refundedAmount,
        gross_paid_amount: grossPaidAmount,
        net_paid_amount: netPaidAmount,
        available_refundable_amount,
        refund_action_eligible,
        latest_payment_at: latestActivity ?? null,
      } as Record<string, unknown>;
    }
    return {
      ...inv,
      status: displayStatus,
      refunded_amount: refundedAmount,
      gross_paid_amount: grossPaidAmount,
      net_paid_amount: netPaidAmount,
      available_refundable_amount,
      refund_action_eligible,
    } as Record<string, unknown>;
  });

  return {
    ok: true,
    invoices: enriched,
    totalCount,
    useDbPage,
    exportCapped,
  };
}
