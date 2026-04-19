import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createInvoiceBodySchema, resolveDiscountAmount } from '@/lib/validations/invoice';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { normalizeInvoiceAssignee } from '@/lib/invoices/invoice-time-summary';
import { buildInvoiceFxRow, resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';
import { resolveActorDisplayName } from '@/lib/audit-log';
import { logInvoiceDraftCreated } from '@/lib/invoices/log-invoice-draft-created';
import { findExistingCustomer } from '@/lib/customers';
import { getDueDateRange, getIssueDateRange } from '@/lib/invoices/list-filters';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import {
  applyRefundDisplayStatus,
  availableRefundableAmount,
  canShowRefundMenuAction,
  normalizeCurrencyForRefund,
  resolveRefundDisplayStatus,
  succeededPaymentGrossInInvoiceCurrency,
} from '@/lib/invoices/refund-display';
import { notifyBusinessEvent } from '@/services/notifications';
import { DASHBOARD_TZ_COOKIE } from '@/lib/dashboard/date-range';
import { invoiceMatchesPastDueUi, resolvePastDueCivilTodayYmd } from '@/lib/invoices/invoice-past-due-ui';
import { normalizeInvoiceRecord, isInvoiceOpenForReporting } from '@/lib/invoices/normalize';
import { logOverdueParityDebug } from '@/lib/invoices/dashboard-invoice-overdue';
import { normalizeClientPaymentScheduleCamel } from '@/lib/invoices/normalize-client-payment-schedule';
import { parseInvoiceReminderSettings, serializeInvoiceReminderSettings } from '@/lib/invoices/reminder-settings';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { assertInvoiceCreationReadiness } from '@/lib/onboarding/invoice-readiness-server';
import {
  buildInvoiceRecurringSummary,
  type RecurringRuleListFields,
} from '@/lib/recurring-invoice/display';
import { fetchDedupeKeysForInvoices, resolveNextReminderForInvoiceDisplay } from '@/lib/invoices/next-pending-reminder';
import { processInvoiceReminders } from '@/lib/invoices/reminder-cron';
import { processScheduledInvoiceSends } from '@/lib/invoices/scheduled-invoice-send-cron';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { fetchAdminPlatformSettings, monthlyInvoiceLimitForPlan } from '@/lib/admin/admin-platform-settings';
import { featureUpgradeMessage, getUserBillingPlan, hasPlanFeature } from '@/lib/billing/plans';
import { assertWorkspaceCoreWriteAccess } from '@/lib/billing/subscription-access';
import { computeInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

/** Same predicate as shared `invoice-past-due-ui` (invoice table Past due + schedule past_due). */
/** Matches list filter `status=partially_paid`: derived status or open balance with payments recorded. */
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
const SELECT_COLS =
  'id, invoice_number, customer_name, customer_id, customer_email, reference_po, subtotal, tax_amount, total, total_in_base, currency, base_currency_code, exchange_rate_to_base, amount_paid, balance_due, total_refunded, use_payment_schedule, status, issue_date, due_date, paid_at, created_at, recurring_rule_id, use_customer_reminder_defaults, reminder_settings, scheduled_send_at, customers ( reminder_settings )';
const LEGACY_SELECT_COLS =
  'id, invoice_number, customer_name, customer_id, customer_email, reference_po, total, currency, amount_paid, balance_due, use_payment_schedule, status, due_date, created_at, scheduled_send_at';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

  const listPerm = await assertBusinessPermission(supabase, businessId, user.id, 'view_data');
  if (!listPerm.ok) return listPerm.response;

  const admin = getSupabaseServiceAdmin();
  if (admin) {
    try {
      await processScheduledInvoiceSends(admin, new Date(), { businessId });
    } catch (e) {
      console.error('[scheduled-invoice-send] list GET drain failed', e);
    }
    try {
      await processInvoiceReminders(admin, new Date(), { businessId });
    } catch (e) {
      console.error('[invoice-reminders] list GET drain failed', e);
    }
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('id', businessId)
    .single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const q = (searchParams.get('q') ?? '').trim();
  /** Lowercase for comparisons (`Partially_Paid` → `partially_paid`). */
  const status = (searchParams.get('status') ?? '').trim().toLowerCase();
  const due = searchParams.get('due') ?? '';
  const due_from = searchParams.get('due_from') ?? '';
  const due_to = searchParams.get('due_to') ?? '';
  const issue = searchParams.get('issue') ?? '';
  const issue_from = searchParams.get('issue_from') ?? '';
  const issue_to = searchParams.get('issue_to') ?? '';
  const customer = searchParams.get('customer') ?? '';
  const schedule_filter = searchParams.get('schedule_filter') ?? '';
  const filter = searchParams.get('filter') ?? '';
  const balance = searchParams.get('balance') ?? '';
  const sort = searchParams.get('sort') ?? 'created_at';
  /** Default descending (newest first for `created_at`) unless `order=asc`. */
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const page_size = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10))
  );

  let query = supabase
    .from('invoices')
    .select(SELECT_COLS, { count: 'exact' })
    .eq('business_id', business.id);

  const dueRange = getDueDateRange(
    due || undefined,
    due_from || undefined,
    due_to || undefined
  );
  const issueRange = getIssueDateRange(
    issue || undefined,
    issue_from || undefined,
    issue_to || undefined
  );
  if (issueRange) {
    query = query.gte('issue_date', issueRange.from).lte('issue_date', issueRange.to);
  }
  if (dueRange) {
    query = query.gte('due_date', dueRange.from).lte('due_date', dueRange.to);
  }

  if (customer) query = query.eq('customer_id', customer);

  if (q) {
    const qLower = `%${q.toLowerCase()}%`;
    const num = parseFloat(q.replace(/[^0-9.-]/g, ''));
    const conditions = [
      `invoice_number.ilike.${qLower}`,
      `customer_name.ilike.${qLower}`,
      `metadata->>company.ilike.${qLower}`,
      `customer_email.ilike.${qLower}`,
      `reference_po.ilike.${qLower}`,
    ];
    if (!Number.isNaN(num)) conditions.push(`total.eq.${num}`);
    query = query.or(conditions.join(','));
  }

  // We apply schedule-aware filters/sorting after next_due_date is derived.
  query = query.order('created_at', { ascending: false });

  let { data: rows, error } = (await query) as {
    data: Record<string, unknown>[] | null;
    error: { message?: string } | null;
  };
  if (error && /column .* does not exist/i.test(error.message || '')) {
    let legacyQuery = supabase
      .from('invoices')
      .select(LEGACY_SELECT_COLS, { count: 'exact' })
      .eq('business_id', business.id);
    if (dueRange) {
      legacyQuery = legacyQuery.gte('due_date', dueRange.from).lte('due_date', dueRange.to);
    }
    if (issueRange) {
      legacyQuery = legacyQuery.gte('issue_date', issueRange.from).lte('issue_date', issueRange.to);
    }
    if (customer) legacyQuery = legacyQuery.eq('customer_id', customer);
    if (q) {
      const qLower = `%${q.toLowerCase()}%`;
      const num = parseFloat(q.replace(/[^0-9.-]/g, ''));
      const conditions = [
        `invoice_number.ilike.${qLower}`,
        `customer_name.ilike.${qLower}`,
        `metadata->>company.ilike.${qLower}`,
        `customer_email.ilike.${qLower}`,
        `reference_po.ilike.${qLower}`,
      ];
      if (!Number.isNaN(num)) conditions.push(`total.eq.${num}`);
      legacyQuery = legacyQuery.or(conditions.join(','));
    }
    legacyQuery = legacyQuery.order('created_at', { ascending: false });
    const legacyRes = await legacyQuery;
    rows = (legacyRes.data ?? null) as Record<string, unknown>[] | null;
    error = legacyRes.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const invoiceIds = (rows ?? []).map((r) => String(r.id));
  let pendingByInvoice = new Map<string, { next_due_date: string | null; remaining_installments: number }>();
  if (invoiceIds.length > 0) {
    const { data: pendingRows } = await supabase
      .from('invoice_payment_schedule_items')
      .select('invoice_id, due_date, status')
      .in('invoice_id', invoiceIds)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    for (const row of pendingRows ?? []) {
      const invId = String((row as any).invoice_id);
      const curr = pendingByInvoice.get(invId);
      if (!curr) {
        pendingByInvoice.set(invId, {
          next_due_date: String((row as any).due_date ?? ''),
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
      const customerReminderSettings =
        (rawRow.customers as { reminder_settings?: unknown } | null | undefined)?.reminder_settings ??
        null;
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
      surface: 'invoice_api_list',
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

  const totalCount = invoices.length;
  const from = (page - 1) * page_size;
  const to = from + page_size;
  invoices = invoices.slice(from, to);

  const pageIds = invoices.map((inv) => inv.id);
  const refundedByInvoice = new Map<string, number>();
  const grossPaidByInvoice = new Map<string, number>();
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
    const { data: succeededPayments } = await supabase
      .from('payments')
      .select('invoice_id, amount, amount_in_invoice_currency, currency')
      .in('invoice_id', pageIds)
      .eq('status', 'succeeded');
    const invCurrencyById = new Map(
      invoices.map((inv) => [
        String(inv.id),
        normalizeCurrencyForRefund((inv as { currency?: string }).currency),
      ])
    );
    for (const row of succeededPayments ?? []) {
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
      if (!(chunk > 0)) continue;
      grossPaidByInvoice.set(invoiceId, (grossPaidByInvoice.get(invoiceId) ?? 0) + chunk);
    }
  }
  const latestSucceededPaymentByInvoice = new Map<string, string>();
  if (pageIds.length > 0) {
    const { data: paymentRows } = await supabase
      .from('payments')
      .select('invoice_id, paid_at, created_at')
      .in('invoice_id', pageIds)
      .eq('status', 'succeeded');
    for (const row of paymentRows ?? []) {
      const invId = String((row as { invoice_id?: string }).invoice_id ?? '');
      if (!invId) continue;
      const touch =
        (row as { paid_at?: string | null; created_at?: string | null }).paid_at ??
        (row as { created_at?: string | null }).created_at ??
        null;
      if (!touch) continue;
      const ts = Date.parse(String(touch));
      if (!Number.isFinite(ts)) continue;
      const prev = latestSucceededPaymentByInvoice.get(invId);
      if (!prev || Date.parse(prev) < ts) latestSucceededPaymentByInvoice.set(invId, String(touch));
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

  invoices = invoices.map((inv) => {
    const rawStatusForRefund = String(inv.status ?? '').toLowerCase();
    const fromPayments = latestSucceededPaymentByInvoice.get(inv.id) ?? null;
    const fromSchedule = latestSchedulePaidByInvoice.get(inv.id) ?? null;
    const latestActivity = maxPaymentTouch(fromPayments, fromSchedule);

    const amountPaidOnInvoice = Number(inv.amount_paid ?? 0);
    const grossFromPaymentRows = grossPaidByInvoice.get(inv.id) ?? 0;
    /** Same canonical “Paid” as invoice detail: `invoices.amount_paid`, with fallback if unset. */
    const grossPaidAmount =
      amountPaidOnInvoice > 0.0001 ? amountPaidOnInvoice : grossFromPaymentRows;

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
      };
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
      };
    }
    return {
      ...inv,
      status: displayStatus,
      refunded_amount: refundedAmount,
      gross_paid_amount: grossPaidAmount,
      net_paid_amount: netPaidAmount,
      available_refundable_amount,
      refund_action_eligible,
    };
  });

  const pageIdsForRecurring = invoices.map((inv) => inv.id);
  const ruleIdsForRecurring = Array.from(
    new Set(invoices.map((i) => i.recurring_rule_id).filter((x): x is string => Boolean(x)))
  );

  const rulesById = new Map<string, RecurringRuleListFields>();
  const rulesBySource = new Map<string, RecurringRuleListFields>();

  if (ruleIdsForRecurring.length > 0) {
    const { data: fromIds } = await supabase
      .from('recurring_invoice_rules')
      .select('id, source_invoice_id, frequency, next_run_date, automation_mode, status')
      .eq('business_id', business.id)
      .in('id', ruleIdsForRecurring);
    for (const row of fromIds ?? []) {
      const o = row as RecurringRuleListFields;
      rulesById.set(String(o.id), o);
    }
  }
  if (pageIdsForRecurring.length > 0) {
    const { data: fromSource } = await supabase
      .from('recurring_invoice_rules')
      .select('id, source_invoice_id, frequency, next_run_date, automation_mode, status')
      .eq('business_id', business.id)
      .in('source_invoice_id', pageIdsForRecurring);
    for (const row of fromSource ?? []) {
      const o = row as RecurringRuleListFields;
      if (o.source_invoice_id) rulesBySource.set(String(o.source_invoice_id), o);
    }
  }

  const reminderKeys = await fetchDedupeKeysForInvoices(supabase, invoices.map((i) => i.id));
  const reminderNow = new Date();
  const invoicesOut = invoices.map((inv) => {
    const recurring = buildInvoiceRecurringSummary(
      inv.id,
      inv.recurring_rule_id,
      rulesById,
      rulesBySource
    );
    const { recurring_rule_id: _drop, ...rest } = inv;
    const sentKeys = reminderKeys.get(inv.id) ?? new Set();
    const next = resolveNextReminderForInvoiceDisplay({
      inv: {
        status: inv.status,
        total: inv.total,
        amount_paid: inv.amount_paid,
        balance_due: inv.balance_due,
        due_date: inv.due_date,
        use_customer_reminder_defaults: inv.use_customer_reminder_defaults,
        reminder_settings: inv.reminder_settings,
        customer_reminder_settings: inv.customer_reminder_settings,
      },
      sentDedupeKeys: sentKeys,
      now: reminderNow,
    });
    return { ...rest, recurring, next_reminder_at: next.next_reminder_at };
  });

  return NextResponse.json({ invoices: invoicesOut, totalCount });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Record<string, unknown>;
    const businessId = body.business_id;
    if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

    const parsed = createInvoiceBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('id, currency, owner_id')
      .eq('id', businessId)
      .single();
    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    const subGate = await assertWorkspaceCoreWriteAccess(
      supabase,
      String((business as { owner_id: string }).owner_id)
    );
    if (!subGate.ok) return subGate.response;

    const readiness = await assertInvoiceCreationReadiness(supabase, String(businessId));
    if (!readiness.ok) return readiness.response;

    const createGate = await assertBusinessPermission(supabase, String(businessId), user.id, 'create_invoice');
    if (!createGate.ok) {
      const manageGate = await assertBusinessPermission(supabase, String(businessId), user.id, 'manage_invoices');
      if (!manageGate.ok) return manageGate.response;
    }

    const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';
    const billingPlan = await getUserBillingPlan(supabase, user.id);

    const baseCur = String((business as { currency?: string }).currency ?? 'USD').toUpperCase();
    const p = parsed.data;
    const useReminderDef =
      (body as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== undefined
        ? Boolean((body as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults)
        : true;
    const reminderParsed =
      parseInvoiceReminderSettings((body as { reminder_settings?: unknown }).reminder_settings) ?? {};
    const reminderRow = serializeInvoiceReminderSettings(reminderParsed, {
      useCustomerDefaults: useReminderDef,
    });
    const customReminderRequested =
      !useReminderDef || Object.keys(reminderParsed as Record<string, unknown>).length > 0;
    const customerName = String(p.customer_name ?? '').trim();
    let subtotal = 0;
    let lineTaxTotal = 0;
    for (const i of p.items) {
      const lineTotal = i.quantity * i.unit_price;
      subtotal += lineTotal;
      const lineTaxPct = (i as { tax_percent?: number }).tax_percent ?? 0;
      lineTaxTotal += lineTotal * (lineTaxPct / 100);
    }
    const discountAmount = resolveDiscountAmount(subtotal, {
      discount_amount: p.discount_amount,
      discount_percent: p.discount_percent,
    });
    const afterDiscount = subtotal - discountAmount;
    const invoiceTaxAmount =
      p.tax_amount ?? (p.tax_percent != null ? afterDiscount * (p.tax_percent / 100) : 0);
    const total = afterDiscount + invoiceTaxAmount + lineTaxTotal;
    const invCur = (p.currency ?? baseCur).toUpperCase();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const nextMonthStart = new Date(monthStart);
    nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);
    const adminClient = getSupabaseServiceAdmin();
    const platformInv = adminClient ? await fetchAdminPlatformSettings(adminClient) : null;
    const monthlyCap = platformInv ? monthlyInvoiceLimitForPlan(billingPlan, platformInv) : null;
    if (monthlyCap != null) {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', nextMonthStart.toISOString());
      if ((count ?? 0) >= monthlyCap) {
        return NextResponse.json(
          {
            error: `You've reached your plan limit of ${monthlyCap} invoices this month. Upgrade to continue.`,
            code: 'plan_limit_invoice_count',
            current_plan: billingPlan,
            cta: 'Upgrade',
          },
          { status: 403 }
        );
      }
    }
    if (invCur !== baseCur && !hasPlanFeature(billingPlan, 'multi_currency')) {
      return NextResponse.json(
        {
          error: featureUpgradeMessage('multi_currency'),
          code: 'plan_feature_multi_currency',
          current_plan: billingPlan,
          cta: 'Upgrade',
        },
        { status: 403 }
      );
    }
    const taxCombined = invoiceTaxAmount + lineTaxTotal;
    let fxRate = 1;
    try {
      fxRate = await resolveExchangeRateToBase(invCur, baseCur, p.exchange_rate_to_base ?? null);
    } catch {
      if (invCur !== baseCur) {
        return NextResponse.json(
          { error: 'Could not fetch exchange rate. Set exchange_rate_to_base or use the company base currency.' },
          { status: 400 }
        );
      }
    }
    const fxRow = buildInvoiceFxRow(baseCur, fxRate, subtotal, taxCombined, total);

    // Payment schedule (optional): validate sum equals invoice total, and use latest scheduled due date.
    const useSchedule = !!p.use_payment_schedule;
    type ScheduleInsertRow = Record<string, unknown>;
    let schedule: ScheduleInsertRow[] = [];
    if (useSchedule) {
      if (!hasPlanFeature(billingPlan, 'automation')) {
        return NextResponse.json(
          {
            error: featureUpgradeMessage('automation'),
            code: 'plan_feature_automation',
            current_plan: billingPlan,
            cta: 'Upgrade',
          },
          { status: 403 }
        );
      }
      const rawSnake = p.payment_schedule;
      const rawCamel = body.paymentSchedule;
      if (Array.isArray(rawCamel) && rawCamel.length > 0) {
        schedule = normalizeClientPaymentScheduleCamel(rawCamel as unknown[]);
      } else if (Array.isArray(rawSnake) && rawSnake.length > 0) {
        schedule = rawSnake as ScheduleInsertRow[];
      }
      if (schedule.length < 1) {
        return NextResponse.json({ error: 'Payment schedule must include at least one row.' }, { status: 400 });
      }
      const sum = schedule.reduce(
        (s: number, r) => s + Number(r.amount ?? 0),
        0
      );
      if (Math.abs(sum - total) > 0.05) {
        return NextResponse.json({ error: 'Payment schedule amounts must sum to invoice total.' }, { status: 400 });
      }
    }
    if (customReminderRequested && !hasPlanFeature(billingPlan, 'automation')) {
      return NextResponse.json(
        {
          error: featureUpgradeMessage('automation'),
          code: 'plan_feature_automation',
          current_plan: billingPlan,
          cta: 'Upgrade',
        },
        { status: 403 }
      );
    }

    const { data: invNum } = await supabase.rpc('next_invoice_number', {
      p_business_id: business.id,
    });
    const invoiceNumber = (invNum as string) ?? 'INV-00001';

    let customerId = p.customer_id ?? null;
    if (!customerId && customerName) {
      const existing = await findExistingCustomer(supabase, business.id, {
        company: customerName,
        name: customerName,
        email: p.customer_email ?? null,
      });
      if (existing?.id) customerId = existing.id;
    }

    const { data: selectedCustomer } = customerId
      ? await supabase
          .from('customers')
          .select(
            'name, company, email, phone, address_line1, address_line2, city, state, postal_code, country'
          )
          .eq('id', customerId)
          .eq('business_id', business.id)
          .maybeSingle()
      : { data: null as null };

    const billingLine1 =
      p.client_billing?.billing_address_line1 ??
      (selectedCustomer as { address_line1?: string | null } | null)?.address_line1 ??
      null;
    const billingLine2 =
      p.client_billing?.billing_address_line2 ??
      (selectedCustomer as { address_line2?: string | null } | null)?.address_line2 ??
      null;
    const billingAddressCombined =
      p.client_billing?.billing_address ??
      ([billingLine1, billingLine2].filter(Boolean).join(', ').trim() || null);
    const metadata =
      p.client_billing || selectedCustomer
        ? {
            contact_person:
              p.client_billing?.contact_person ??
              (selectedCustomer as { name?: string | null } | null)?.name ??
              null,
            company:
              p.client_billing?.company ??
              (selectedCustomer as { company?: string | null } | null)?.company ??
              null,
            billing_address_line1: billingLine1,
            billing_address_line2: billingLine2,
            billing_address: billingAddressCombined,
            billing_city:
              p.client_billing?.billing_city ??
              (selectedCustomer as { city?: string | null } | null)?.city ??
              null,
            billing_state:
              p.client_billing?.billing_state ??
              (selectedCustomer as { state?: string | null } | null)?.state ??
              null,
            billing_postal_code:
              p.client_billing?.billing_postal_code ??
              (selectedCustomer as { postal_code?: string | null } | null)?.postal_code ??
              null,
            billing_country:
              p.client_billing?.billing_country ??
              (selectedCustomer as { country?: string | null } | null)?.country ??
              null,
            billing_phone:
              p.client_billing?.billing_phone ??
              (selectedCustomer as { phone?: string | null } | null)?.phone ??
              null,
            use_delivery_address: !!p.client_billing?.use_delivery_address,
            ...(p.client_billing?.use_delivery_address
              ? {
                  delivery_company: p.client_billing.delivery_company ?? null,
                  delivery_contact_person: p.client_billing.delivery_contact_person ?? null,
                  delivery_email: p.client_billing.delivery_email ?? null,
                  delivery_phone: p.client_billing.delivery_phone ?? null,
                  delivery_address: p.client_billing.delivery_address ?? null,
                  delivery_city: p.client_billing.delivery_city ?? null,
                  delivery_state: p.client_billing.delivery_state ?? null,
                  delivery_postal_code: p.client_billing.delivery_postal_code ?? null,
                  delivery_country: p.client_billing.delivery_country ?? null,
                }
              : {}),
          }
        : null;

    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert({
        business_id: business.id,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: p.customer_email ?? null,
        status: 'draft',
        invoice_number: invoiceNumber,
        issue_date: p.issue_date ?? new Date().toISOString().slice(0, 10),
        due_date: useSchedule
          ? schedule
              .map((r) => String(r.due_date ?? ''))
              .sort()
              .slice(-1)[0]
          : p.due_date,
        currency: invCur,
        ...fxRow,
        subtotal,
        tax_amount: taxCombined,
        total,
        notes: p.notes ?? null,
        theme_id: p.theme_id ?? null,
        reference_po: p.reference_po ?? null,
        discount_amount: discountAmount,
        terms: p.terms ?? null,
        metadata,
        use_payment_schedule: useSchedule,
        amount_paid: 0,
        balance_due: total,
        use_customer_reminder_defaults: useReminderDef,
        reminder_settings: reminderRow,
        show_time_summary: p.show_time_summary ?? false,
      })
      .select()
      .single();

    if (invError || !invoice) {
      const msg = invError?.message ?? 'Create failed';
      const hint = /discount_amount|reference_po|terms|metadata|tax_percent|column.*does not exist/i.test(msg)
        ? ' Run the migration: Supabase SQL Editor → paste and run supabase/migrations/006_invoices_pricing_and_metadata.sql, then restart the dev server.'
        : '';
      return NextResponse.json({ error: msg + hint }, { status: 500 });
    }

    for (let i = 0; i < p.items.length; i++) {
      const item = p.items[i];
      const taxPct = (item as { tax_percent?: number }).tax_percent ?? 0;
      const amount = item.quantity * item.unit_price;
      await supabase.from('invoice_items').insert({
        invoice_id: invoice.id,
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount,
        unit_label: normalizeInvoiceUnitLabel(item.unit_label ?? 'item'),
        sort_order: i,
        tax_percent: taxPct,
        assignee: normalizeInvoiceAssignee((item as { assignee?: unknown }).assignee),
      });
    }

    if (useSchedule) {
      for (const row of schedule) {
        await supabase.from('invoice_payment_schedule_items').insert({
          invoice_id: invoice.id,
          description: String(row.description ?? ''),
          amount: Number(row.amount),
          due_date: row.due_date,
          status: (row.status as string | undefined) ?? 'pending',
        });
      }
    }

    await logInvoiceDraftCreated({
      supabase,
      businessId: business.id,
      performedByUserId: user.id,
      performedByName: actorName,
      invoiceId: String(invoice.id),
      invoiceNumber,
      customerName,
      total: Number(total),
      currencyCode: invCur,
      source: 'manual',
      hasPaymentSchedule: useSchedule && schedule.length > 0,
    });

    const { data: full } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), invoice_payment_schedule_items(*)')
      .eq('id', invoice.id)
      .single();

    return NextResponse.json(full ?? invoice);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
