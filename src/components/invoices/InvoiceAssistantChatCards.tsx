'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { Building2, CheckCircle2, FileDown, Mail, MapPin, Phone, UserRound } from 'lucide-react';
import { ASSISTANT_SUCCESS_CREATED } from '@/lib/business-assistant/assistant-tone';
import { renderAssistantFormattedText } from '@/components/invoices/assistant-formatted-text';
import type { AssistantInvoicePreviewContext } from '@/components/invoices/assistant-invoice-preview-context';
import type { InvoiceAssistantChatCard } from '@/lib/invoices/conversational-invoice-wizard/types';
import {
  formatAssistantEditedCaption,
  mergeInvoiceAssistantChatCard,
  type AssistantInvoiceChatOverlay,
} from '@/lib/invoices/assistant-invoice-chat-overlay';
import { formatDisplayDate } from '@/lib/utils/date';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { cn } from '@/lib/utils/cn';
import { invoiceStatusBadgeClassName, statusLabel } from '@/lib/invoices/edit-rules';
import { roundMoney2 } from '@/lib/currency/amounts-in-base';
import { flagEmojiFromIso } from '@/lib/location/resolve-country-input';
import {
  getInvoiceAmountPaidInBase,
  getInvoiceBalanceDueInBase,
} from '@/lib/invoices/normalize';

function formatMoney(total: number | null, currency: string | null): string {
  if (total == null || !Number.isFinite(total)) return '—';
  return formatCurrencyAmount(total, currency || 'USD');
}

type PaidPeriodListItem = Extract<
  InvoiceAssistantChatCard,
  { card_type: 'invoice_list' }
>['items'][number];
type InsightSummaryCard = Extract<InvoiceAssistantChatCard, { card_type: 'insight_summary' }>;

const PARTIAL_BALANCE_EPS = 0.02;

/** When `amount_paid` on the card is stale/zero but balance reflects a partial, match list API logic. */
function listPartiallyPaidDisplayPaid(
  item: { total?: number | null; amount_paid?: number | null; balance_due?: number | null },
  balanceDueEffective: number | null
): number {
  const tot = Number(item.total ?? 0);
  const bal =
    balanceDueEffective != null && Number.isFinite(balanceDueEffective)
      ? balanceDueEffective
      : item.balance_due != null && Number.isFinite(item.balance_due)
        ? item.balance_due
        : null;
  const ap = item.amount_paid;
  if (ap != null && Number.isFinite(ap) && ap > PARTIAL_BALANCE_EPS) {
    return ap;
  }
  if (tot > PARTIAL_BALANCE_EPS && bal != null && bal < tot - PARTIAL_BALANCE_EPS) {
    return roundMoney2(Math.max(0, tot - bal));
  }
  return ap != null && Number.isFinite(ap) ? Math.max(0, ap) : 0;
}

function overdueFxFieldBundle(item: PaidPeriodListItem, baseCur: string) {
  const b = baseCur.trim().toUpperCase() || 'USD';
  return {
    total: Number(item.total ?? 0),
    total_in_base: Number(item.total_in_base ?? 0),
    exchange_rate_to_base: Number(item.exchange_rate_to_base ?? 0),
    currency: (item.currency || '').trim().toUpperCase() || 'USD',
    base_currency_code: b,
  };
}

/** Open balance in business base from stored invoice FX; respects overlay `balance_due` / `amount_paid`. */
function balanceDueInBaseForOverdueItem(
  item: PaidPeriodListItem,
  balanceDueEffective: number | null,
  amountPaidEffective: number | null,
  baseCur: string
): number | null {
  if (!item.fx_for_base_reliable) return null;
  const fx = overdueFxFieldBundle(item, baseCur);
  const bal =
    balanceDueEffective != null && Number.isFinite(balanceDueEffective)
      ? Math.max(0, balanceDueEffective)
      : item.balance_due != null && Number.isFinite(item.balance_due)
        ? Math.max(0, item.balance_due)
        : 0;
  if (bal <= PARTIAL_BALANCE_EPS) return null;
  const paid =
    amountPaidEffective != null && Number.isFinite(amountPaidEffective)
      ? Math.max(0, amountPaidEffective)
      : Number(item.amount_paid ?? 0);
  const n = roundMoney2(
    getInvoiceBalanceDueInBase({
      ...fx,
      amount_paid: paid,
      balance_due: bal,
    })
  );
  return n > PARTIAL_BALANCE_EPS ? n : null;
}

function formatOverdueLegToBaseLine(args: {
  legAmount: number;
  item: PaidPeriodListItem;
  balanceDueEffective: number | null;
  amountPaidEffective: number | null;
  baseCur: string;
}): ReactNode {
  const legStr = formatMoney(args.legAmount, args.item.currency);
  const c = (args.item.currency || '').trim().toUpperCase();
  const b = args.baseCur.trim().toUpperCase() || 'USD';
  if (c === b) {
    return legStr;
  }
  const baseVal = balanceDueInBaseForOverdueItem(
    args.item,
    args.balanceDueEffective,
    args.amountPaidEffective,
    args.baseCur
  );
  if (baseVal == null) return legStr;
  return (
    <>
      <span className="text-[var(--muted)]">{legStr}</span>
      <span className="text-[var(--muted)] mx-1">→</span>
      <span className="font-semibold text-[var(--foreground)]">{formatMoney(baseVal, b)}</span>
    </>
  );
}

function amountPaidInBaseForOverduePartial(
  item: PaidPeriodListItem,
  paidLeg: number,
  baseCur: string
): number | null {
  if (!item.fx_for_base_reliable || paidLeg <= PARTIAL_BALANCE_EPS) return null;
  const fx = overdueFxFieldBundle(item, baseCur);
  const n = roundMoney2(
    getInvoiceAmountPaidInBase({
      ...fx,
      amount_paid: paidLeg,
    })
  );
  return n > PARTIAL_BALANCE_EPS ? n : null;
}

function totalInBaseForOverduePartial(item: PaidPeriodListItem, baseCur: string): number | null {
  if (!item.fx_for_base_reliable) return null;
  const n = roundMoney2(Number(item.total_in_base ?? 0));
  return n > PARTIAL_BALANCE_EPS ? n : null;
}

function formatOverdueTotalLegToBase(item: PaidPeriodListItem, baseCur: string): ReactNode {
  const leg = Number(item.total ?? 0);
  const legStr = formatMoney(leg, item.currency);
  const c = (item.currency || '').trim().toUpperCase();
  const b = baseCur.trim().toUpperCase() || 'USD';
  if (c === b) return legStr;
  const tinb = totalInBaseForOverduePartial(item, baseCur);
  if (tinb == null) return legStr;
  return (
    <>
      <span className="text-[var(--muted)]">{legStr}</span>
      <span className="text-[var(--muted)] mx-1">→</span>
      <span className="font-semibold text-[var(--foreground)]">{formatMoney(tinb, b)}</span>
    </>
  );
}

function formatOverduePaidLegToBase(
  item: PaidPeriodListItem,
  paidLeg: number,
  baseCur: string
): ReactNode {
  const legStr = formatMoney(paidLeg, item.currency);
  const c = (item.currency || '').trim().toUpperCase();
  const b = baseCur.trim().toUpperCase() || 'USD';
  if (c === b) return legStr;
  const pib = amountPaidInBaseForOverduePartial(item, paidLeg, baseCur);
  if (pib == null) return legStr;
  return (
    <>
      <span className="text-[var(--muted)]">{legStr}</span>
      <span className="text-[var(--muted)] mx-1">→</span>
      <span className="font-semibold text-[var(--foreground)]">{formatMoney(pib, b)}</span>
    </>
  );
}

function PaidPeriodInvoiceAmountBlock({
  item,
  baseCur,
  balanceDueEffective,
}: {
  item: PaidPeriodListItem;
  baseCur: string;
  balanceDueEffective: number | null | undefined;
}) {
  const baseCode = (baseCur || 'USD').trim().toUpperCase() || 'USD';
  const baseAmt = item.amount_in_base;
  const received = (item.received_by_currency ?? []).filter(
    (x) => x.amount > 0.00001 && Number.isFinite(x.amount)
  );
  const bal =
    balanceDueEffective != null && Number.isFinite(balanceDueEffective)
      ? balanceDueEffective
      : null;
  const isPartial = bal != null && bal > PARTIAL_BALANCE_EPS;
  const fallbackPaidLeg = listPartiallyPaidDisplayPaid(item, balanceDueEffective ?? null);

  /** Sum of payment rows in window in business base (stored `amount_in_base` per payment). */
  const hasBase =
    baseAmt != null && Number.isFinite(baseAmt) && baseAmt > PARTIAL_BALANCE_EPS;
  const baseStr = hasBase ? formatMoney(baseAmt, baseCode) : null;

  const originals = received.map((x) => formatMoney(x.amount, x.currency)).join(' · ');
  const hasLegs = received.length > 0;
  const hasForeignLeg = received.some(
    (x) => (x.currency || '').trim().toUpperCase() !== baseCode
  );

  if (!hasLegs && !hasBase) {
    if (isPartial && fallbackPaidLeg > PARTIAL_BALANCE_EPS) {
      return (
        <p className="text-sm leading-snug tabular-nums">
          <span className="font-semibold text-[var(--foreground)]">
            {formatMoney(fallbackPaidLeg, item.currency)}
          </span>{' '}
          <span className="text-xs font-normal text-[var(--muted)]">paid</span>
        </p>
      );
    }
    if (isPartial) {
      return (
        <p className="text-sm text-[var(--muted)]">
          Partially paid — payment amount breakdown unavailable for this period.
        </p>
      );
    }
    return (
      <p className="text-sm text-amber-800 dark:text-amber-200/90">
        Collected amount unavailable — open the invoice for details.
      </p>
    );
  }

  // Never show only foreign leg amounts without a stored base conversion (payment-time FX).
  if (hasForeignLeg && !hasBase) {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-200/90">
        Collected in foreign currency — base amount unavailable for this period. Open the invoice for
        details.
      </p>
    );
  }

  const paidCaption = isPartial ? (
    <span className="text-xs font-normal text-[var(--muted)]">paid</span>
  ) : (
    <span className="text-xs font-normal text-[var(--muted)]">Paid</span>
  );

  // Base-currency collections (or only base legs): single primary amount.
  if (!hasForeignLeg && hasBase) {
    return (
      <p className="text-sm leading-snug tabular-nums">
        <span className="font-semibold text-[var(--foreground)]">{baseStr}</span>{' '}
        {paidCaption}
      </p>
    );
  }

  // Foreign + stored base: primary = base (scannable), secondary = original payment leg(s).
  if (hasForeignLeg && hasBase && baseStr) {
    const originalToBase = received
      .filter((x) => (x.currency || '').trim().toUpperCase() !== baseCode)
      .map((x) => `${formatMoney(x.amount, x.currency)} → ${baseStr}`)
      .join(' · ');
    return (
      <div className="space-y-0.5">
        <p className="text-sm leading-snug tabular-nums">
          <span className="font-semibold text-[var(--foreground)]">{baseStr}</span>{' '}
          {paidCaption}
        </p>
        <p className="text-xs leading-snug tabular-nums text-[var(--muted)]">
          {originalToBase || originals}
        </p>
      </div>
    );
  }

  // e.g. base missing but only base-currency legs (should be rare) — show leg total only as fallback.
  return (
    <p className="text-sm leading-snug tabular-nums">
      <span className="font-semibold text-[var(--foreground)]">{baseStr ?? originals}</span>{' '}
      {baseStr || isPartial ? paidCaption : null}
    </p>
  );
}

function InvoiceStatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
        invoiceStatusBadgeClassName(status)
      )}
    >
      {statusLabel(status ?? 'draft')}
    </span>
  );
}

type Props = {
  cards: InvoiceAssistantChatCard[];
  /** After saving from Assistant invoice modal — merged into cards + drives “Edited” labels. */
  invoiceOverlayById?: Record<string, AssistantInvoiceChatOverlay>;
  /** When set, “Send reminder” posts this text as the next user message (assistant invoice actions). */
  onFollowUpMessage?: (text: string) => void;
  followUpDisabled?: boolean;
  /** Opens the quick preview modal with the same internal id + snapshot as the card. */
  onOpenInvoicePreview?: (ctx: AssistantInvoicePreviewContext) => void;
  /** Optional intercept for summary CTA clicks (return true to prevent navigation). */
  onInsightSummaryCta?: (card: InsightSummaryCard) => boolean;
};

function AssistantViewInvoiceCta({
  context,
  className,
  onOpenInvoicePreview,
}: {
  context: AssistantInvoicePreviewContext;
  className: string;
  onOpenInvoicePreview?: (ctx: AssistantInvoicePreviewContext) => void;
}) {
  if (onOpenInvoicePreview) {
    return (
      <button
        type="button"
        onClick={() => onOpenInvoicePreview(context)}
        className={className}
      >
        View invoice
      </button>
    );
  }
  return (
    <Link href={`/dashboard/invoices/${context.invoiceId}`} className={className}>
      View invoice
    </Link>
  );
}

export function InvoiceAssistantChatCards({
  cards,
  invoiceOverlayById,
  onFollowUpMessage,
  followUpDisabled,
  onOpenInvoicePreview,
  onInsightSummaryCta,
}: Props) {
  const mergedCards = useMemo(
    () => cards.map((c) => mergeInvoiceAssistantChatCard(c, invoiceOverlayById)),
    [cards, invoiceOverlayById]
  );

  const openInvoiceEditModal = useCallback(
    (ctx: AssistantInvoicePreviewContext) => {
      onOpenInvoicePreview?.({ ...ctx, initialMode: 'edit' });
    },
    [onOpenInvoicePreview]
  );

  if (!mergedCards.length) return null;

  return (
    <div className="flex w-full flex-col gap-2">
      {mergedCards.map((card, idx) => {
        if (card.card_type === 'invoice_created_success') {
          const hrefEdit = `/dashboard/invoices/${card.invoice_id}/edit`;
          const invLabel = card.invoice_number?.trim() || 'Draft';
          const createdOverlay = invoiceOverlayById?.[card.invoice_id];
          return (
            <div
              key={`created-${card.invoice_id}-${idx}`}
              className="space-y-3 rounded-2xl border border-emerald-200/90 bg-emerald-50/95 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/35"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="h-9 w-9 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
                    <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                      {ASSISTANT_SUCCESS_CREATED}
                    </p>
                    {createdOverlay?.editedAtMs ? (
                      <span className="shrink-0 rounded-md bg-emerald-100/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800/90 dark:bg-emerald-900/50 dark:text-emerald-200/90">
                        Edited
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-emerald-900/90 dark:text-emerald-200/90">{invLabel}</p>
                  {card.customer_name?.trim() ? (
                    <p className="text-xs text-emerald-800/85 dark:text-emerald-300/85">
                      {card.customer_name.trim()}
                    </p>
                  ) : null}
                  {createdOverlay?.editedAtMs ? (
                    <p className="text-[10px] text-emerald-800/70 dark:text-emerald-400/80">
                      {formatAssistantEditedCaption(createdOverlay.editedAtMs)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <AssistantViewInvoiceCta
                  context={{
                    invoiceId: card.invoice_id,
                    invoice_number: card.invoice_number,
                    customer_name: card.customer_name,
                  }}
                  onOpenInvoicePreview={onOpenInvoicePreview}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-3 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                />
                {onOpenInvoicePreview ? (
                  <button
                    type="button"
                    onClick={() =>
                      openInvoiceEditModal({
                        invoiceId: card.invoice_id,
                        invoice_number: card.invoice_number,
                        customer_name: card.customer_name,
                      })
                    }
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-300/80 bg-white px-3 py-2.5 text-center text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100 dark:hover:bg-emerald-900/70"
                  >
                    Edit invoice
                  </button>
                ) : (
                  <Link
                    href={hrefEdit}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-300/80 bg-white px-3 py-2.5 text-center text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100 dark:hover:bg-emerald-900/70"
                  >
                    Edit invoice
                  </Link>
                )}
              </div>
            </div>
          );
        }

        if (card.card_type === 'invoice_sent_success') {
          const hrefView = `/dashboard/invoices/${card.invoice_id}`;
          const pdfHref = `/api/invoices/${card.invoice_id}/pdf`;
          const invLabel = card.invoice_number?.trim() || 'Draft';
          const cust = card.customer_name?.trim() || 'your customer';
          const primaryLine = `Invoice ${invLabel} sent to ${cust}.`;
          const reminder = card.reminder_followup_message?.trim() ?? '';
          const sentOverlay = invoiceOverlayById?.[card.invoice_id];
          return (
            <div
              key={`sent-${card.invoice_id}-${idx}`}
              className="space-y-4 rounded-2xl border border-indigo-200/85 bg-gradient-to-b from-indigo-50/95 to-white p-4 shadow-sm ring-1 ring-slate-900/[0.04] dark:border-indigo-900/45 dark:from-indigo-950/40 dark:to-slate-900/40 dark:ring-white/[0.06]"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="h-9 w-9 shrink-0 text-indigo-600 dark:text-indigo-400"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <p className="min-w-0 flex-1 text-base font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50">
                      {primaryLine}
                    </p>
                    {sentOverlay?.editedAtMs ? (
                      <span className="shrink-0 rounded-md bg-indigo-100/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200">
                        Edited
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    They’ll receive an email with a payment link.
                  </p>
                  {sentOverlay?.editedAtMs ? (
                    <p className="text-[10px] text-slate-500 dark:text-slate-500">
                      {formatAssistantEditedCaption(sentOverlay.editedAtMs)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <AssistantViewInvoiceCta
                  context={{
                    invoiceId: card.invoice_id,
                    invoice_number: card.invoice_number,
                    customer_name: card.customer_name,
                  }}
                  onOpenInvoicePreview={onOpenInvoicePreview}
                  className="inline-flex flex-1 min-w-[8rem] items-center justify-center rounded-xl bg-indigo-600 px-3 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                />
                <a
                  href={pdfHref}
                  className="inline-flex flex-1 min-w-[8rem] items-center justify-center gap-2 rounded-xl border border-indigo-200/90 bg-white px-3 py-2.5 text-center text-sm font-medium text-indigo-900 shadow-sm transition hover:bg-indigo-50/80 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/60"
                >
                  <FileDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  Download PDF
                </a>
                {reminder && onFollowUpMessage ? (
                  <button
                    type="button"
                    disabled={followUpDisabled}
                    onClick={() => onFollowUpMessage(reminder)}
                    className="inline-flex flex-1 min-w-[8rem] items-center justify-center rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-center text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-700/80"
                  >
                    Send reminder
                  </button>
                ) : null}
              </div>
            </div>
          );
        }

        if (card.card_type === 'invoice_payment_success') {
          const paidDateLabel = formatDisplayDate(card.payment_recorded_at);
          const paidStatusLabel = card.status?.trim() ? statusLabel(card.status) : 'Paid';
          const paidLine = paidDateLabel === '—' ? paidStatusLabel : `${paidStatusLabel} · ${paidDateLabel}`;
          return (
            <div
              key={`paid-${card.invoice_id}-${idx}`}
              className="space-y-3 rounded-2xl border border-emerald-200/85 bg-gradient-to-b from-emerald-50/95 to-white p-4 shadow-sm ring-1 ring-slate-900/[0.04] dark:border-emerald-900/45 dark:from-emerald-950/45 dark:to-slate-900/40 dark:ring-white/[0.06]"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="h-9 w-9 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-base font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50">
                    Payment recorded
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {card.invoice_number?.trim() || 'Invoice'}
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                    {paidLine}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Balances on your invoice cards are updated.
                  </p>
                </div>
              </div>
              <AssistantViewInvoiceCta
                context={{
                  invoiceId: card.invoice_id,
                  invoice_number: card.invoice_number,
                  customer_name: card.customer_name,
                  currency: card.currency,
                  status: card.status ?? 'paid',
                }}
                onOpenInvoicePreview={onOpenInvoicePreview}
                className="inline-flex min-w-[8rem] items-center justify-center rounded-xl bg-emerald-600 px-3 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              />
            </div>
          );
        }

        if (card.card_type === 'customer_created_summary') {
          const hrefCustomer = `/dashboard/customers/${card.customer_id}`;
          const name = card.display_name?.trim() || 'Customer';
          const line1 = card.address_line1?.trim() || '';
          const line2 = card.address_line2?.trim() || '';
          const hasStreet = Boolean(line1 || line2);
          const cc = card.country_code?.trim().toUpperCase() || '';
          const cname = card.country_name?.trim() || '';
          const countryDisplay =
            cname || cc
              ? `${cname || cc}${cc ? ` ${flagEmojiFromIso(cc)}` : ''}`
              : null;
          const labelMuted =
            'text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400';
          const valueBody = 'text-sm leading-relaxed text-slate-900 dark:text-slate-100';
          return (
            <div
              key={`cust-summary-${card.customer_id}-${idx}`}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-indigo-50/40 shadow-[0_1px_0_rgba(15,23,42,0.04)] ring-1 ring-slate-900/[0.04] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/50 dark:ring-white/[0.06]"
            >
              <div className="border-b border-slate-200/80 bg-white/90 px-4 py-3.5 dark:border-slate-700/80 dark:bg-slate-900/60">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                    <Building2 className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      Customer created
                    </p>
                    <p className="text-base font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50">
                      {name}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 px-4 py-4">
                {card.email?.trim() ? (
                  <div className="flex gap-3">
                    <Mail
                      className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className={labelMuted}>Email</p>
                      <p className={valueBody}>{card.email.trim()}</p>
                    </div>
                  </div>
                ) : null}
                {card.phone?.trim() ? (
                  <div className="flex gap-3">
                    <Phone
                      className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className={labelMuted}>Phone</p>
                      <p className={valueBody}>{card.phone.trim()}</p>
                    </div>
                  </div>
                ) : null}
                {card.contact_name?.trim() ? (
                  <div className="flex gap-3">
                    <UserRound
                      className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className={labelMuted}>Contact person</p>
                      <p className={valueBody}>{card.contact_name.trim()}</p>
                    </div>
                  </div>
                ) : null}
                {hasStreet ? (
                  <div className="flex gap-3">
                    <MapPin
                      className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                      aria-hidden
                    />
                    <div className="min-w-0 space-y-1">
                      <p className={labelMuted}>Street address</p>
                      {line1 ? <p className={valueBody}>{line1}</p> : null}
                      {line2 ? <p className={valueBody}>{line2}</p> : null}
                    </div>
                  </div>
                ) : null}
                {card.city?.trim() ? (
                  <div className="pl-7">
                    <p className={labelMuted}>City</p>
                    <p className={valueBody}>{card.city.trim()}</p>
                  </div>
                ) : null}
                {card.state?.trim() ? (
                  <div className="pl-7">
                    <p className={labelMuted}>State / province / region</p>
                    <p className={valueBody}>{card.state.trim()}</p>
                  </div>
                ) : null}
                {card.postal_code?.trim() ? (
                  <div className="pl-7">
                    <p className={labelMuted}>Postal code</p>
                    <p className={valueBody}>{card.postal_code.trim()}</p>
                  </div>
                ) : null}
                {countryDisplay ? (
                  <div className="pl-7">
                    <p className={labelMuted}>Country</p>
                    <p className={`${valueBody} font-semibold`}>{countryDisplay}</p>
                  </div>
                ) : null}
              </div>
              <div className="border-t border-slate-200/80 bg-white/60 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-900/40">
                <Link
                  href={hrefCustomer}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  View in customers →
                </Link>
              </div>
            </div>
          );
        }

        /* Customer cards are no longer emitted — conversation carries details. Legacy messages skip rendering. */
        if (card.card_type === 'customer_single' || card.card_type === 'customer_pick') {
          return null;
        }

        if (card.card_type === 'invoice_single') {
          const hrefView = `/dashboard/invoices/${card.invoice_id}`;
          const hrefEdit = `/dashboard/invoices/${card.invoice_id}/edit`;
          const primaryHref = card.primary_action === 'edit_invoice' ? hrefEdit : hrefView;
          const primaryLabel = card.primary_action === 'edit_invoice' ? 'Edit invoice' : 'View invoice';

          const headline = (card.headline?.trim() || 'Invoice').replace(/\*\*/g, '');
          const invNum = card.invoice_number?.trim() || 'Draft';
          const cust = card.customer_name?.trim() || '—';
          const cur = (card.currency || 'USD').trim().toUpperCase() || 'USD';
          const summaryLine = `${invNum} — ${cust} — ${formatMoney(card.total, card.currency)} ${cur}`;
          const singleOverlay = invoiceOverlayById?.[card.invoice_id];

          const secondaries: { href: string; label: string }[] = [];
          if (card.primary_action === 'edit_invoice') {
            secondaries.push({ href: hrefView, label: 'View invoice' });
          }
          if (card.display_edit_secondary === true) {
            secondaries.push({ href: hrefEdit, label: 'Edit invoice' });
          }

          const singlePreviewCtx: AssistantInvoicePreviewContext = {
            invoiceId: card.invoice_id,
            invoice_number: card.invoice_number,
            customer_name: card.customer_name,
            total: card.total,
            balance_due: singleOverlay?.balance_due ?? undefined,
            currency: card.currency,
            status: card.status,
          };

          return (
            <div
              key={`single-${card.invoice_id}-${idx}`}
              className="space-y-2 rounded-2xl border border-[var(--card-border)] bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {headline}
              </p>
              <p className="text-sm font-medium leading-snug text-[var(--foreground)]">{summaryLine}</p>
              {singleOverlay?.balance_due != null && Number.isFinite(singleOverlay.balance_due) ? (
                <p className="text-xs font-medium text-[var(--foreground)]">
                  Balance due {formatMoney(singleOverlay.balance_due, card.currency)}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <InvoiceStatusBadge status={card.status} />
                {singleOverlay?.editedAtMs ? (
                  <span className="rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-700/80 dark:text-slate-400">
                    Edited
                  </span>
                ) : null}
              </div>
              {singleOverlay?.editedAtMs ? (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {formatAssistantEditedCaption(singleOverlay.editedAtMs)}
                </p>
              ) : null}
              {singleOverlay?.due_date ? (
                <p className="text-xs text-[var(--muted)]">Due {formatDisplayDate(singleOverlay.due_date)}</p>
              ) : null}
              {card.helper_text ? (
                <p className="text-xs leading-relaxed text-[var(--muted)]">{card.helper_text}</p>
              ) : null}
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                {card.primary_action === 'view_invoice' && onOpenInvoicePreview ? (
                  <AssistantViewInvoiceCta
                    context={singlePreviewCtx}
                    onOpenInvoicePreview={onOpenInvoicePreview}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  />
                ) : card.primary_action === 'edit_invoice' && onOpenInvoicePreview ? (
                  <button
                    type="button"
                    onClick={() => openInvoiceEditModal(singlePreviewCtx)}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    {primaryLabel}
                  </button>
                ) : (
                  <Link
                    href={primaryHref}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    {primaryLabel}
                  </Link>
                )}
                {secondaries.map((s) =>
                  s.label === 'View invoice' && onOpenInvoicePreview ? (
                    <AssistantViewInvoiceCta
                      key={s.label}
                      context={singlePreviewCtx}
                      onOpenInvoicePreview={onOpenInvoicePreview}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-center text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--card)]"
                    />
                  ) : s.label === 'Edit invoice' && onOpenInvoicePreview ? (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => openInvoiceEditModal(singlePreviewCtx)}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-center text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--card)]"
                    >
                      {s.label}
                    </button>
                  ) : (
                    <Link
                      key={s.label}
                      href={s.href}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-center text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--card)]"
                    >
                      {s.label}
                    </Link>
                  )
                )}
              </div>
            </div>
          );
        }

        if (card.card_type === 'invoice_pick') {
          return (
            <div
              key={`pick-${idx}`}
              className="flex flex-col gap-2 rounded-2xl border border-[var(--card-border)] bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {card.options.map((opt) => {
                const optOverlay = invoiceOverlayById?.[opt.invoice_id];
                const optPreviewCtx: AssistantInvoicePreviewContext = {
                  invoiceId: opt.invoice_id,
                  invoice_number: opt.invoice_number,
                  customer_name: opt.customer_name,
                  total: opt.total,
                  balance_due: optOverlay?.balance_due ?? undefined,
                  currency: opt.currency,
                  status: opt.status,
                };
                const hrefView = `/dashboard/invoices/${opt.invoice_id}`;
                const hrefEdit = `/dashboard/invoices/${opt.invoice_id}/edit`;
                const primaryEdit = card.intent === 'edit_invoice' && card.can_edit;
                const pickInv = opt.invoice_number ? `**${opt.invoice_number}**` : '**Invoice**';
                return (
                  <div
                    key={opt.invoice_id}
                    className="flex flex-col gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-sm text-[var(--foreground)]">
                        {renderAssistantFormattedText(pickInv)}
                      </p>
                      {opt.customer_name ? (
                        <p className="truncate text-xs text-[var(--muted)]">{opt.customer_name}</p>
                      ) : null}
                      <p className="text-sm text-[var(--foreground)]">
                        {renderAssistantFormattedText(`**${formatMoney(opt.total, opt.currency)}**`)}
                      </p>
                      {optOverlay?.balance_due != null && Number.isFinite(optOverlay.balance_due) ? (
                        <p className="text-xs text-[var(--muted)]">
                          Balance due {formatMoney(optOverlay.balance_due, opt.currency)}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <InvoiceStatusBadge status={opt.status} />
                        {optOverlay?.editedAtMs ? (
                          <span className="rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-700/80 dark:text-slate-400">
                            Edited
                          </span>
                        ) : null}
                      </div>
                      {optOverlay?.editedAtMs ? (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {formatAssistantEditedCaption(optOverlay.editedAtMs)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {primaryEdit ? (
                        onOpenInvoicePreview ? (
                          <button
                            type="button"
                            onClick={() => openInvoiceEditModal(optPreviewCtx)}
                            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                          >
                            Edit invoice
                          </button>
                        ) : (
                          <Link
                            href={hrefEdit}
                            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                          >
                            Edit invoice
                          </Link>
                        )
                      ) : onOpenInvoicePreview ? (
                        <AssistantViewInvoiceCta
                          context={optPreviewCtx}
                          onOpenInvoicePreview={onOpenInvoicePreview}
                          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                        />
                      ) : (
                        <Link
                          href={hrefView}
                          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                        >
                          View invoice
                        </Link>
                      )}
                      {primaryEdit ? (
                        onOpenInvoicePreview ? (
                          <AssistantViewInvoiceCta
                            context={optPreviewCtx}
                            onOpenInvoicePreview={onOpenInvoicePreview}
                            className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
                          />
                        ) : (
                          <Link
                            href={hrefView}
                            className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
                          >
                            View invoice
                          </Link>
                        )
                      ) : card.intent === 'view_invoice' ? (
                        onOpenInvoicePreview ? (
                          <button
                            type="button"
                            onClick={() => openInvoiceEditModal(optPreviewCtx)}
                            className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
                          >
                            Edit invoice
                          </button>
                        ) : (
                          <Link
                            href={hrefEdit}
                            className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
                          >
                            Edit invoice
                          </Link>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        if (card.card_type === 'invoice_list') {
          const formatPaidLine = (iso: string | null | undefined) => {
            if (!iso) return null;
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return null;
            try {
              return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
            } catch {
              return iso.slice(0, 10);
            }
          };

          const baseCur = (card.base_currency_code || 'USD').trim().toUpperCase() || 'USD';
          const isPaidPeriod = card.list_variant === 'paid_period';
          const isUnpaidList = card.list_variant === 'unpaid';
          const isOverdueList = card.list_variant === 'overdue';
          const isDueTodayList = card.list_variant === 'due_today';
          const isPartiallyPaidListVariant = card.list_variant === 'partially_paid';
          const isCustomerInvoiceList = card.list_variant === 'customer';
          const isGeneralList = card.list_variant === 'general';
          /** Invoice stored FX for open-balance lines (not payment-time / collected). */
          const showReceivablesInvoiceFx =
            isUnpaidList ||
            isOverdueList ||
            isDueTodayList ||
            isPartiallyPaidListVariant ||
            isCustomerInvoiceList;

          const collectedAmountsOnly = (item: (typeof card.items)[number]): string => {
            const parts =
              item.received_by_currency?.filter((x) => x.amount > 0.00001 && Number.isFinite(x.amount)) ??
              [];
            if (parts.length > 0) {
              return parts.map((x) => formatMoney(x.amount, x.currency)).join(' · ');
            }
            return formatMoney(item.total, item.currency);
          };

          const baseEquivalentSuffix = (item: (typeof card.items)[number]): string | null => {
            const baseAmt = item.amount_in_base;
            if (baseAmt == null || !Number.isFinite(baseAmt)) return null;
            const parts =
              item.received_by_currency?.filter((x) => x.amount > 0.00001 && Number.isFinite(x.amount)) ??
              [];
            if (parts.length === 1) {
              const c = parts[0]!.currency.trim().toUpperCase();
              if (c === baseCur) return null;
              return `${baseCur} equivalent: ${formatMoney(baseAmt, baseCur)}`;
            }
            if (parts.length > 1) {
              return `${baseCur} equivalent: ${formatMoney(baseAmt, baseCur)}`;
            }
            const legCur = (item.currency || '').trim().toUpperCase();
            if (legCur && legCur !== baseCur) {
              return `${baseCur} equivalent: ${formatMoney(baseAmt, baseCur)}`;
            }
            return null;
          };

          const listHeading =
            card.title && card.title.trim()
              ? `**${card.title.trim().replace(/\*\*/g, '')}**`
              : '**Invoices**';

          return (
            <div
              key={`list-${idx}`}
              className="space-y-2 rounded-2xl border border-[var(--card-border)] bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="text-sm text-[var(--foreground)]">
                {renderAssistantFormattedText(listHeading)}
              </p>
              <ul className="flex flex-col gap-1.5">
                {card.items.map((item, itemIdx) => {
                  const paidLabel = formatPaidLine(item.paid_at);
                  const equiv = !isPaidPeriod ? baseEquivalentSuffix(item) : null;
                  const st = (item.status || '').toLowerCase();
                  const showStatusChip =
                    !isPaidPeriod || (st !== 'paid' && st !== '' && st !== 'unknown');
                  const invLine = item.invoice_number
                    ? `**${item.invoice_number}**`
                    : '**Invoice**';
                  const listOverlay = invoiceOverlayById?.[item.invoice_id];
                  const balanceDueEffective =
                    listOverlay?.balance_due ?? item.balance_due ?? null;
                  const overlayPaidRaw = listOverlay?.amount_paid;
                  const amountPaidEffective =
                    overlayPaidRaw != null && Number.isFinite(Number(overlayPaidRaw))
                      ? Math.max(0, Number(overlayPaidRaw))
                      : item.amount_paid != null && Number.isFinite(Number(item.amount_paid))
                        ? Math.max(0, Number(item.amount_paid))
                        : null;
                  const displayDueForOverdue = item.display_due_ymd ?? null;
                  const overdueDays =
                    item.days_overdue != null && Number.isFinite(item.days_overdue)
                      ? item.days_overdue
                      : null;

                  const showPartiallyPaidBreakdown =
                    showReceivablesInvoiceFx &&
                    (st === 'partially_paid' || st === 'partially_refunded');
                  const dueYmdForPartial =
                    displayDueForOverdue ??
                    (item.due_date != null && String(item.due_date).trim()
                      ? String(item.due_date).slice(0, 10)
                      : null);

                  const partialBalanceLeg =
                    balanceDueEffective ??
                    (item.balance_due != null && Number.isFinite(item.balance_due)
                      ? item.balance_due
                      : 0);

                  const openBalanceMainNode = (() => {
                    if (
                      !showReceivablesInvoiceFx ||
                      st === 'partially_paid' ||
                      st === 'partially_refunded'
                    )
                      return null;
                    const bal =
                      balanceDueEffective ??
                      (item.balance_due != null && Number.isFinite(item.balance_due)
                        ? item.balance_due
                        : null);
                    if (bal != null && Number.isFinite(bal) && bal > PARTIAL_BALANCE_EPS) {
                      return formatOverdueLegToBaseLine({
                        legAmount: bal,
                        item,
                        balanceDueEffective,
                        amountPaidEffective,
                        baseCur,
                      });
                    }
                    return collectedAmountsOnly(item);
                  })();

                  return (
                    <li key={item.invoice_id}>
                      {(isUnpaidList ||
                        isOverdueList ||
                        isDueTodayList ||
                        isPartiallyPaidListVariant ||
                        isCustomerInvoiceList ||
                        isGeneralList) &&
                      itemIdx > 0 ? (
                        <hr className="mb-2 border-0 border-t border-[var(--card-border)] dark:border-slate-600" />
                      ) : null}
                      <div className="flex flex-col gap-2 rounded-xl border border-transparent px-2 py-2 transition hover:border-[var(--card-border)] hover:bg-[var(--background)] sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="text-sm text-[var(--foreground)]">
                            {renderAssistantFormattedText(invLine)}
                          </p>
                          {item.customer_name ? (
                            <p className="truncate text-xs text-[var(--muted)]">{item.customer_name}</p>
                          ) : null}
                          {showPartiallyPaidBreakdown &&
                          dueYmdForPartial &&
                          /^\d{4}-\d{2}-\d{2}$/.test(dueYmdForPartial) ? (
                            <p className="text-xs text-[var(--muted)] tabular-nums">
                              Due date {formatDisplayDate(dueYmdForPartial)}
                              {isOverdueList && overdueDays != null && overdueDays > 0
                                ? ` · ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`
                                : null}
                            </p>
                          ) : null}
                          {isPaidPeriod ? (
                            <>
                              <PaidPeriodInvoiceAmountBlock
                                item={item}
                                baseCur={baseCur}
                                balanceDueEffective={balanceDueEffective}
                              />
                              {balanceDueEffective != null &&
                              Number.isFinite(balanceDueEffective) &&
                              balanceDueEffective > PARTIAL_BALANCE_EPS ? (
                                <p className="text-xs text-[var(--muted)] tabular-nums">
                                  Balance due {formatMoney(balanceDueEffective, item.currency)}
                                </p>
                              ) : null}
                            </>
                          ) : showPartiallyPaidBreakdown ? (
                            <div className="space-y-1 text-xs tabular-nums text-[var(--foreground)]">
                              <p>
                                <span className="text-[var(--muted)]">Total amount </span>
                                {showReceivablesInvoiceFx
                                  ? formatOverdueTotalLegToBase(item, baseCur)
                                  : formatMoney(item.total, item.currency)}
                              </p>
                              <p>
                                <span className="text-[var(--muted)]">Amount paid </span>
                                {showReceivablesInvoiceFx ? (
                                  <span className="font-semibold">
                                    {formatOverduePaidLegToBase(
                                      item,
                                      listPartiallyPaidDisplayPaid(item, balanceDueEffective),
                                      baseCur
                                    )}
                                  </span>
                                ) : (
                                  renderAssistantFormattedText(
                                    `**${formatMoney(
                                      listPartiallyPaidDisplayPaid(item, balanceDueEffective),
                                      item.currency
                                    )}**`
                                  )
                                )}
                              </p>
                              {Math.max(0, Number(item.total_refunded ?? 0)) > 0.0001 ? (
                                <p>
                                  <span className="text-[var(--muted)]">Refunded </span>
                                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                                    {formatMoney(Number(item.total_refunded ?? 0), item.currency)}
                                  </span>
                                </p>
                              ) : null}
                              <p>
                                <span className="text-[var(--muted)]">Amount overdue </span>
                                {showReceivablesInvoiceFx
                                  ? formatOverdueLegToBaseLine({
                                      legAmount: partialBalanceLeg,
                                      item,
                                      balanceDueEffective,
                                      amountPaidEffective,
                                      baseCur,
                                    })
                                  : formatMoney(partialBalanceLeg, item.currency)}
                              </p>
                              <p>
                                <span className="text-[var(--muted)]">Balance due </span>
                                {showReceivablesInvoiceFx
                                  ? formatOverdueLegToBaseLine({
                                      legAmount: partialBalanceLeg,
                                      item,
                                      balanceDueEffective,
                                      amountPaidEffective,
                                      baseCur,
                                    })
                                  : formatMoney(partialBalanceLeg, item.currency)}
                              </p>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-[var(--foreground)] tabular-nums">
                                {showReceivablesInvoiceFx && openBalanceMainNode != null ? (
                                  typeof openBalanceMainNode === 'string' ? (
                                    <span className="font-semibold">{openBalanceMainNode}</span>
                                  ) : (
                                    openBalanceMainNode
                                  )
                                ) : (
                                  renderAssistantFormattedText(
                                    `**${collectedAmountsOnly(item)}**`
                                  )
                                )}
                              </p>
                              {equiv ? (
                                <p className="text-xs text-[var(--muted)]">{equiv}</p>
                              ) : null}
                            </>
                          )}
                          {showStatusChip || listOverlay?.editedAtMs ? (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              {showStatusChip ? (
                                <InvoiceStatusBadge status={item.status} />
                              ) : null}
                              {listOverlay?.editedAtMs ? (
                                <span className="rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-700/80 dark:text-slate-400">
                                  Edited
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {listOverlay?.editedAtMs ? (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {formatAssistantEditedCaption(listOverlay.editedAtMs)}
                            </p>
                          ) : null}
                          {paidLabel ? (
                            <p className="text-xs text-[var(--muted)]">
                              {isPaidPeriod ? paidLabel : `Paid ${paidLabel}`}
                            </p>
                          ) : null}
                          {!isPaidPeriod &&
                          !showPartiallyPaidBreakdown &&
                          !showReceivablesInvoiceFx &&
                          listOverlay?.balance_due != null &&
                          Number.isFinite(listOverlay.balance_due) ? (
                            <p className="text-xs text-[var(--muted)]">
                              Balance due {formatMoney(listOverlay.balance_due, item.currency)}
                            </p>
                          ) : null}
                        </div>
                        <AssistantViewInvoiceCta
                          context={{
                            invoiceId: item.invoice_id,
                            invoice_number: item.invoice_number,
                            customer_name: item.customer_name,
                            total: item.total,
                            balance_due: balanceDueEffective ?? undefined,
                            currency: item.currency,
                            status: item.status,
                          }}
                          onOpenInvoicePreview={onOpenInvoicePreview}
                          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }

        if (card.card_type === 'insight_summary') {
          const compact = card.presentation === 'compact';
          const showTitle = Boolean(card.title?.trim());
          return (
            <div
              key={`insight-${idx}`}
              className="rounded-2xl border border-[var(--card-border)] bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {!compact ? (
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Summary
                </p>
              ) : null}
              {showTitle ? (
                <p
                  className={
                    compact
                      ? 'text-sm text-[var(--foreground)]'
                      : 'mt-1 text-sm text-[var(--foreground)]'
                  }
                >
                  {renderAssistantFormattedText(card.title)}
                </p>
              ) : null}
              <dl className={showTitle ? 'mt-3 space-y-2' : 'mt-0 space-y-2'}>
                {card.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex flex-col gap-1 border-t border-[var(--card-border)] pt-2 first:border-t-0 first:pt-0 sm:flex-row sm:items-baseline sm:justify-between"
                  >
                    <dt className="text-xs text-[var(--muted)]">{row.label}</dt>
                    <dd className="text-sm text-[var(--foreground)]">
                      {renderAssistantFormattedText(row.value)}
                    </dd>
                  </div>
                ))}
              </dl>
              {card.cta?.href ? (
                <div className="mt-3 border-t border-[var(--card-border)] pt-3">
                  {onInsightSummaryCta ? (
                    <button
                      type="button"
                      onClick={() => {
                        const handled = onInsightSummaryCta(card);
                        if (!handled && card.cta?.href) window.location.href = card.cta.href;
                      }}
                      className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      {card.cta.label || 'View'}
                    </button>
                  ) : (
                    <Link
                      href={card.cta.href}
                      className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      {card.cta.label || 'View'}
                    </Link>
                  )}
                </div>
              ) : null}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
