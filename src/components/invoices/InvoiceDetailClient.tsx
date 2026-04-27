'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { resolveInvoicePaidAtFormatted } from '@/lib/invoices/invoice-document-payload';
import { CheckCircle2 } from 'lucide-react';
import type { Customer } from '@/lib/database.types';
import { statusLabel } from '@/lib/invoices/edit-rules';
import { formatDisplayDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { InvoicePreviewActions } from '@/components/invoices/InvoicePreviewActions';
import {
  InvoicePreviewSaved,
  type SavedBusiness,
  type SavedInvoice,
  type SavedInvoiceItem,
} from '@/components/invoices/InvoicePreview';
import CustomerFormModal from '@/components/customers/CustomerFormModal';
import {
  getBusinessBaseCurrency,
  resolveInvoiceTransactionCurrency,
} from '@/lib/business/currency-policy';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { InvoiceSavedQueryToast } from '@/components/invoices/invoice-saved-query-toast';
import { InvoiceActivitySection } from '@/components/invoices/InvoiceActivitySection';
import type { InvoiceRecurringSummary } from '@/lib/recurring-invoice/display';
import { InvoiceRecurringPreviewSection } from '@/components/invoices/InvoiceRecurringPreviewSection';
import type { AutoRemindersInitialPayload } from '@/lib/invoices/auto-reminders-eligibility';
import type { InvoiceDetailSecondaryPayload } from '@/lib/invoices/invoice-secondary-payload';

type ScheduleRow = {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string | null;
};

type Props = {
  invoiceId: string;
  businessId: string;
  initialCustomerId: string | null;
  status: string;
  /** Server: true when captured payments exist and refundable remainder > 0 (matches refund API). */
  showRefundAction: boolean;
  invoiceNumber: string;
  dueDate: string;
  amountPaid: number;
  autoRemindersInitial: AutoRemindersInitialPayload;
  savedBusiness: SavedBusiness;
  initialInvoice: SavedInvoice;
  items: SavedInvoiceItem[];
  scheduleRows: ScheduleRow[];
  recurringSummary?: InvoiceRecurringSummary | null;
  canManageRecurring?: boolean;
  /** Server-computed; only when a pending reminder exists. */
  nextReminderStatusLine: string | null;
  /** Draft + scheduled send strip. */
  scheduledSendLine: string | null;
  /** Business IANA timezone (scheduled send date/time). */
  accountTimezone: string;
  /** Formatted for header metadata (e.g. from `invoices.updated_at`). */
  savedAtDateLabel: string | null;
};

export function InvoiceDetailClient({
  invoiceId,
  businessId,
  initialCustomerId,
  status,
  showRefundAction,
  invoiceNumber,
  dueDate,
  amountPaid,
  autoRemindersInitial,
  savedBusiness,
  initialInvoice,
  items,
  scheduleRows,
  recurringSummary = null,
  canManageRecurring = false,
  nextReminderStatusLine,
  scheduledSendLine,
  accountTimezone,
  savedAtDateLabel,
}: Props) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<SavedInvoice>(initialInvoice);
  const [secondaryPanels, setSecondaryPanels] = useState<InvoiceDetailSecondaryPayload | null>(null);
  const [secondaryLoadFailed, setSecondaryLoadFailed] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId);
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [selectQuery, setSelectQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [activeCustomerIndex, setActiveCustomerIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const { showSuccessToast, showErrorToast } = useToasts();

  useEffect(() => {
    setInvoice(initialInvoice);
  }, [initialInvoice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/invoices/${encodeURIComponent(invoiceId)}/secondary-panels`,
          { cache: 'no-store' }
        );
        if (!res.ok) {
          if (!cancelled) setSecondaryLoadFailed(true);
          return;
        }
        const data = (await res.json()) as InvoiceDetailSecondaryPayload;
        if (!cancelled) {
          setSecondaryPanels(data);
        }
      } catch {
        if (!cancelled) setSecondaryLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const effectiveStatus = secondaryPanels?.displayStatus ?? status;
  const effectiveShowRefund = secondaryPanels?.showRefundAction ?? showRefundAction;
  const effectiveNextReminder = secondaryPanels?.nextReminderStatusLine ?? nextReminderStatusLine;
  const effectiveRecurring = secondaryPanels?.recurringSummary ?? recurringSummary;
  const activityLoading = secondaryPanels === null && !secondaryLoadFailed;
  const activityLogs = secondaryPanels?.auditLogs ?? [];

  /**
   * After the scheduled instant (future at mount), refresh once so the server can send the invoice.
   * Past-due drafts are drained on the server when this page or the list loads; Hobby crons run at most daily.
   */
  useEffect(() => {
    if (String(effectiveStatus).toLowerCase() !== 'draft') return;
    const iso = invoice.scheduled_send_at;
    if (!iso || !String(iso).trim()) return;
    const dueMs = Date.parse(String(iso));
    if (Number.isNaN(dueMs) || dueMs <= Date.now()) return;
    const delay = Math.min(dueMs - Date.now() + 1500, 86_400_000);
    const t = window.setTimeout(() => router.refresh(), delay);
    return () => window.clearTimeout(t);
  }, [effectiveStatus, invoice.scheduled_send_at, router]);

  const customerMissing = useMemo(() => {
    return !selectedCustomerId || !String(invoice.customer_name ?? '').trim();
  }, [selectedCustomerId, invoice.customer_name]);

  const paidDateDisplay = useMemo(() => {
    if (String(effectiveStatus).toLowerCase() !== 'paid') return null;
    return resolveInvoicePaidAtFormatted({
      ...invoice,
      payment_schedule: scheduleRows,
    });
  }, [effectiveStatus, invoice, scheduleRows]);

  const isPaidWithDate =
    String(effectiveStatus).toLowerCase() === 'paid' && Boolean(paidDateDisplay);

  const filteredCustomers = useMemo(() => {
    const q = selectQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 40);
    return customers
      .filter((c) => {
        const label = String(c.company || c.name || '').toLowerCase();
        return (
          label.includes(q) ||
          String(c.email || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 40);
  }, [customers, selectQuery]);

  const attachCustomerToInvoice = async (customer?: Customer) => {
    if (!customer?.id) return;
    try {
      const customerName = String(customer.company || customer.name || '').trim();
    const customerEmail = String(customer.email || '').trim() || null;
    const baseCode = getBusinessBaseCurrency({ currency: savedBusiness.currency });
    const transactionCurrency = resolveInvoiceTransactionCurrency({
      businessBase: baseCode,
      customerPreferred: (customer as { preferred_currency_code?: string | null })
        .preferred_currency_code,
      invoiceCurrencyOverride: null,
    });
    const explicitCompanyRaw = String(customer.company || '').trim();
    const explicitNameRaw = String(customer.name || '').trim();
    const explicitCompany =
      explicitCompanyRaw &&
      explicitNameRaw &&
      explicitCompanyRaw.toLowerCase() === explicitNameRaw.toLowerCase()
        ? ''
        : explicitCompanyRaw;

    const nextBillingCountry = String(customer.country ?? '').trim().toUpperCase() || null;

    const patchPayload = {
      customer_id: customer.id,
      customer_name: customerName,
      customer_email: customerEmail,
      currency: transactionCurrency,
      client_billing: {
        ...(invoice.metadata ?? {}),
        company: explicitCompany || null,
        contact_person: String(customer.name ?? '').trim() || null,
        billing_address_line1: String(customer.address_line1 ?? '').trim() || null,
        billing_address_line2: String(customer.address_line2 ?? '').trim() || null,
        billing_address: [customer.address_line1, customer.address_line2]
          .filter(Boolean)
          .join(', ')
          .trim() || null,
        billing_city: String(customer.city ?? '').trim() || null,
        billing_state: String(customer.state ?? '').trim() || null,
        billing_postal_code: String(customer.postal_code ?? '').trim() || null,
        billing_country: nextBillingCountry,
        billing_phone: String(customer.phone ?? '').trim() || null,
      },
    };

      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to attach customer');
      setSelectedCustomerId(String(customer.id));

      setInvoice((prev) => ({
        ...prev,
        customer_name: customerName,
        customer_email: customerEmail,
        currency: transactionCurrency,
        metadata: {
          ...(prev.metadata ?? {}),
          company: explicitCompany || null,
          contact_person: String(customer.name ?? '').trim() || null,
          billing_address_line1: String(customer.address_line1 ?? '').trim() || null,
          billing_address_line2: String(customer.address_line2 ?? '').trim() || null,
          billing_address:
            [customer.address_line1, customer.address_line2].filter(Boolean).join(', ').trim() ||
            null,
          billing_city: String(customer.city ?? '').trim() || null,
          billing_state: String(customer.state ?? '').trim() || null,
          billing_postal_code: String(customer.postal_code ?? '').trim() || null,
          billing_country: nextBillingCountry,
          billing_phone: String(customer.phone ?? '').trim() || null,
        },
      }));
      showSuccessToast('Customer added to invoice');
    } catch {
      showErrorToast('Something went wrong. Please retry');
    }
  };

  const handleCustomerSaved = async (customer?: Customer) => {
    await attachCustomerToInvoice(customer);
    setModalOpen(false);
  };

  const loadCustomers = async () => {
    setCustomersLoading(true);
    try {
      const res = await fetch(
        `/api/customers?business_id=${encodeURIComponent(businessId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load customers');
      setCustomers((data ?? []) as Customer[]);
      setActiveCustomerIndex(0);
    } finally {
      setCustomersLoading(false);
    }
  };

  const openSelectCustomerModal = () => {
    setSelectModalOpen(true);
    setSelectQuery('');
    if (customers.length === 0 && !customersLoading) {
      void loadCustomers();
    }
  };

  const selectExistingCustomer = (customer: Customer) => {
    setSelectModalOpen(false);
    void attachCustomerToInvoice(customer);
  };

  const dueDateDisplay = useMemo(() => formatDisplayDate(dueDate), [dueDate]);
  const previewSubline = savedAtDateLabel
    ? `Saved ${savedAtDateLabel} · due ${dueDateDisplay}`
    : `Saved data · due ${dueDateDisplay}`;

  const statusPillNode = useMemo(() => {
    if (isPaidWithDate) {
      return (
        <span
          className={cn(
            'inline-flex max-w-full min-w-0 shrink-0 items-center gap-1.5 tabular-nums',
            'rounded-full border border-zenzex-200/70 bg-zenzex-100 text-zenzex-800 shadow-sm',
            'dark:border-zenzex-800/50 dark:bg-zenzex-900/45 dark:text-zenzex-200 dark:shadow-none',
            'max-sm:px-2 max-sm:py-0.5 max-sm:text-xs',
            'px-3 py-1.5 text-sm',
          )}
        >
          <span className="font-semibold text-zenzex-900 dark:text-zenzex-200">Paid</span>
          <span className="min-w-0 text-zenzex-800/90 max-sm:text-[11px] max-sm:leading-tight dark:text-zenzex-300/95">
            {paidDateDisplay}
          </span>
        </span>
      );
    }
    return (
      <span
        className={cn(
          'inline-flex w-fit min-w-0 max-w-full shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap font-medium',
          'max-sm:rounded-full max-sm:px-2.5 max-sm:py-0.5 max-sm:text-xs',
          'rounded-full px-3 py-1 text-sm',
          effectiveStatus === 'paid'
            ? 'bg-zenzex-100 text-zenzex-800 dark:bg-zenzex-900/50 dark:text-zenzex-300'
            : effectiveStatus === 'voided'
              ? 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
              : effectiveStatus === 'overdue'
                ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                : effectiveStatus === 'refunded' || effectiveStatus === 'partially_refunded'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
                  : effectiveStatus === 'sent' ||
                      effectiveStatus === 'partially_paid' ||
                      effectiveStatus === 'viewed'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
        )}
      >
        {statusLabel(effectiveStatus)}
      </span>
    );
  }, [effectiveStatus, isPaidWithDate, paidDateDisplay]);

  return (
    <div className="mx-auto max-w-6xl invoice-detail-page">
      <InvoiceSavedQueryToast />
      <header
        className={cn(
          'print:hidden w-full min-w-0',
          'mb-2.5 sm:mb-6',
          'max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-2 max-sm:gap-y-1.5',
          'sm:flex sm:items-center sm:justify-between sm:gap-4',
        )}
        aria-label="Invoice preview"
      >
        <div className="max-sm:contents sm:min-w-0 sm:flex-1 sm:flex sm:flex-col sm:gap-1">
          <Link
            href="/dashboard/invoices"
            className={cn(
              'w-fit self-start -mx-1 inline-flex items-center rounded-lg px-1 py-0.5 text-sm text-slate-500 transition-colors',
              'max-sm:row-start-1 max-sm:col-start-1',
              'hover:bg-indigo-500/[0.06] hover:text-indigo-600',
              'dark:text-slate-400 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300',
            )}
          >
            ← Invoices
          </Link>
          <h1
            className={cn(
              'min-w-0 text-slate-900 dark:text-white',
              'max-sm:row-start-2 max-sm:col-start-1 max-w-full truncate',
              'text-lg font-semibold leading-tight tracking-tight max-sm:max-w-full',
              'sm:mt-1 sm:text-2xl sm:font-bold',
            )}
          >
            {invoiceNumber}
          </h1>
        </div>
        <p
          className={cn(
            'text-slate-600 max-sm:row-start-1 max-sm:col-start-2 sm:hidden dark:text-slate-300',
            'shrink-0 self-center justify-self-end text-sm font-bold',
            'max-sm:leading-none',
          )}
        >
          Invoice preview
        </p>
        <p
          className={cn(
            'text-xs leading-relaxed text-slate-500 dark:text-slate-400',
            'max-sm:row-start-3 max-sm:col-start-1 sm:hidden',
            'min-w-0 break-words pr-0',
          )}
        >
          {previewSubline}
        </p>
        <div
          className={cn(
            'min-w-0',
            'max-sm:contents sm:flex sm:shrink-0 sm:items-center sm:gap-4',
          )}
        >
          <div
            className={cn('sm:shrink-0', 'max-sm:row-start-3 max-sm:col-start-2 max-sm:justify-self-end')}
          >
            {statusPillNode}
          </div>
          <div
            className={cn(
              'min-w-0',
              'max-sm:row-start-4 max-sm:col-span-2 max-sm:min-w-0 max-sm:justify-self-stretch',
              'max-w-full',
            )}
          >
            <InvoicePreviewActions
              businessId={businessId}
              invoiceId={invoiceId}
              invoiceNumber={invoiceNumber}
              status={effectiveStatus}
              showRefundAction={effectiveShowRefund}
              amountPaid={Number(amountPaid ?? 0)}
              customerMissing={customerMissing}
              dueDate={dueDate}
              invoiceTotal={Number(invoice.total ?? 0)}
              invoiceBalanceDue={
                invoice.balance_due != null
                  ? Number(invoice.balance_due)
                  : Math.max(0, Number(invoice.total ?? 0) - Number(invoice.amount_paid ?? 0))
              }
              invoiceAmountPaid={Number(invoice.amount_paid ?? 0)}
              scheduledSendAtIso={invoice.scheduled_send_at ?? null}
              accountTimezone={accountTimezone}
              autoRemindersInitial={autoRemindersInitial}
              onAutoRemindersSaved={() => router.refresh()}
              onScheduleSendSaved={() => router.refresh()}
            />
          </div>
        </div>
      </header>

      {scheduledSendLine ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-indigo-200/80 bg-indigo-50/60 px-3 py-2.5 text-sm text-indigo-900 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-100 print:hidden">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
          <span className="leading-snug">{scheduledSendLine}</span>
        </div>
      ) : null}

      {effectiveNextReminder ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700/80 dark:bg-slate-800/40 dark:text-slate-200 print:hidden">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
          <span className="leading-snug">{effectiveNextReminder}</span>
        </div>
      ) : null}

      {customerMissing && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200 print:hidden">
          <p className="font-medium">Customer required before sending invoice</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openSelectCustomerModal}
              className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400"
            >
              Select customer
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center rounded-lg border border-amber-400/70 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              Create new
            </button>
          </div>
        </div>
      )}

      {effectiveStatus === 'voided' && (
        <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200 print:hidden">
          <span className="font-semibold uppercase tracking-wide">Voided</span>
          <span className="ml-2">This invoice is cancelled, non-payable, and locked from edits.</span>
        </div>
      )}

      {effectiveRecurring ? (
        <InvoiceRecurringPreviewSection
          businessId={businessId}
          recurring={effectiveRecurring}
          canManage={canManageRecurring}
        />
      ) : null}

      <div className="lg:grid lg:grid-cols-[1fr_minmax(260px,320px)] lg:items-start lg:gap-8 xl:gap-10 print:grid-cols-1">
        <div className="min-w-0">
          <section>
            <h2 className="mb-2 hidden text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:block print:absolute print:-left-[9999px] print:invisible">
              Invoice preview
            </h2>
            <p className="mb-3 hidden text-sm text-slate-600 dark:text-slate-400 sm:mb-4 sm:block print:absolute print:-left-[9999px] print:invisible">
              {previewSubline}
            </p>
            <div className="invoice-print-container mx-auto w-full min-w-0 max-w-full overflow-x-hidden">
              <InvoicePreviewSaved
                source="saved"
                data={{
                  business: savedBusiness,
                  invoice: { ...invoice, payment_schedule: scheduleRows ?? [] },
                  items,
                }}
              />
            </div>
          </section>
        </div>

        <aside className="mt-8 min-w-0 lg:mt-0 print:hidden">
          <InvoiceActivitySection
            logs={activityLogs}
            isLoading={activityLoading}
            className="lg:sticky lg:top-24"
          />
        </aside>
      </div>

      <CustomerFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleCustomerSaved}
        businessId={businessId}
        companyBaseCurrency={getBusinessBaseCurrency({ currency: savedBusiness.currency })}
      />

      {selectModalOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close select customer modal"
            onClick={() => setSelectModalOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Select customer
              </h3>
              <button
                type="button"
                onClick={() => setSelectModalOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <input
              type="text"
              value={selectQuery}
              onChange={(e) => {
                setSelectQuery(e.target.value);
                setActiveCustomerIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveCustomerIndex((prev) =>
                    Math.min(prev + 1, Math.max(0, filteredCustomers.length - 1))
                  );
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveCustomerIndex((prev) => Math.max(prev - 1, 0));
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const customer = filteredCustomers[activeCustomerIndex];
                  if (customer) selectExistingCustomer(customer);
                }
              }}
              placeholder="Search customers..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {customersLoading ? (
                <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">Fetching customers…</p>
              ) : filteredCustomers.length > 0 ? (
                filteredCustomers.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectExistingCustomer(c);
                    }}
                    onMouseEnter={() => setActiveCustomerIndex(idx)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                      idx === activeCustomerIndex
                        ? 'bg-slate-100 dark:bg-slate-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {String(c.company || c.name || 'Customer')}
                    </span>
                    {c.email ? (
                      <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {c.email}
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-slate-600 dark:text-slate-300">
                  <p>No customer found</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectModalOpen(false);
                      setModalOpen(true);
                    }}
                    className="mt-2 inline-flex rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                  >
                    Create new customer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
