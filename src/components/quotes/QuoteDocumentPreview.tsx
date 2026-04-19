import { formatCurrencyAmount } from '@/lib/utils/currency';
import { formatDisplayDate } from '@/lib/utils/date';
import { labelForCurrencyCode } from '@/lib/currency/supported';
import {
  formatAddressBlockLines,
  formatCustomerSnapshotToLines,
  formatCustomerDeliverySnapshotToLines,
  formatIssuerContactLines,
  type CustomerSnapshotInput,
} from '@/lib/quotes/address-format';
import type { QuoteIssuerInfo } from '@/lib/quotes/issuer';
import { QUOTE_DECISION_VIA_LABELS, type QuoteDecisionVia } from '@/lib/quotes/via-options';
import { getConfirmationMethodSubtextFromVia, isManualConfirmationVia } from '@/lib/quotes/confirmation-method';

export type { QuoteIssuerInfo };

export type QuotePreviewItem = {
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  amount?: number;
  tax_percent?: number;
};

type Props = {
  issuer: QuoteIssuerInfo;
  quoteNumber: string | null;
  issueDate: string;
  expiryDate: string | null;
  currency: string;
  status?: string | null;
  customerSnapshot: CustomerSnapshotInput | null;
  items: QuotePreviewItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  acceptedAt?: string | null;
  acceptedVia?: string | null;
  acceptedNote?: string | null;
  rejectedAt?: string | null;
  rejectedVia?: string | null;
  rejectionReason?: string | null;
  confirmationChannel?: 'email' | 'phone' | 'in_person' | null;
};

function LinesBlock({ lines, emptyHint }: { lines: string[]; emptyHint?: string }) {
  if (lines.length === 0) {
    return emptyHint ? (
      <p className="text-xs italic text-slate-400 dark:text-slate-500">{emptyHint}</p>
    ) : null;
  }
  return (
    <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-400">{lines.join('\n')}</p>
  );
}

function ConfirmationMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="whitespace-pre-wrap text-sm font-medium text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  );
}

export function QuoteDocumentPreview({
  issuer,
  quoteNumber,
  issueDate,
  expiryDate,
  currency,
  status,
  customerSnapshot,
  items,
  subtotal,
  tax,
  total,
  notes,
  acceptedAt,
  acceptedVia,
  acceptedNote,
  rejectedAt,
  rejectedVia,
  rejectionReason,
  confirmationChannel,
}: Props) {
  const issuerAddr = formatAddressBlockLines({
    line1: issuer.address_line1,
    line2: issuer.address_line2,
    city: issuer.city,
    state: issuer.state,
    postal_code: issuer.postal_code,
    country: issuer.country,
  });
  const issuerContact = formatIssuerContactLines({
    email: issuer.email,
    phone: issuer.phone,
    tax_id: issuer.tax_id,
  });

  const custName = customerSnapshot?.name?.trim() || 'Customer';
  const custCompany = customerSnapshot?.company?.trim();
  const custEmail = customerSnapshot?.email?.trim();
  const custAddrLines = formatCustomerSnapshotToLines(customerSnapshot);
  const deliveryAddrLines = formatCustomerDeliverySnapshotToLines(customerSnapshot);

  const code = (currency || 'USD').toUpperCase();
  const logoSrc = issuer.logo_url?.trim() || null;
  const viaDisplay = (v: string | null | undefined) =>
    v ? QUOTE_DECISION_VIA_LABELS[v as QuoteDecisionVia] ?? v : null;
  const st = String(status ?? '').toLowerCase();
  const isManualAccepted =
    st === 'accepted_manual' ||
    (st === 'accepted' && isManualConfirmationVia(acceptedVia ?? null));
  const isManualRejected =
    st === 'rejected_manual' ||
    (st === 'rejected' && isManualConfirmationVia(rejectedVia ?? null));
  const showAcceptMeta =
    (st === 'accepted' || st === 'accepted_customer' || st === 'accepted_manual') &&
    (Boolean(acceptedAt) ||
      Boolean(String(acceptedVia ?? '').trim()) ||
      Boolean(acceptedNote?.trim()));
  const showRejectMeta =
    (st === 'rejected' || st === 'rejected_customer' || st === 'rejected_manual') &&
    (Boolean(rejectedAt) ||
      Boolean(String(rejectedVia ?? '').trim()) ||
      Boolean(rejectionReason?.trim()));

  const acceptViaValue = (() => {
    if (!showAcceptMeta) return null;
    if (isManualAccepted) {
      return getConfirmationMethodSubtextFromVia(acceptedVia ?? null) ?? 'Manual';
    }
    return viaDisplay(acceptedVia ?? null);
  })();

  const rejectViaValue = (() => {
    if (!showRejectMeta) return null;
    if (isManualRejected) {
      return getConfirmationMethodSubtextFromVia(rejectedVia ?? null) ?? 'Manual';
    }
    return viaDisplay(rejectedVia ?? null);
  })();

  const statusLabel = (() => {
    if (st === 'accepted_manual' || isManualAccepted) return 'Accepted (manual)';
    if (st === 'rejected_manual' || isManualRejected) return 'Rejected (manual)';
    if (st === 'accepted_customer') return 'Accepted (customer)';
    if (st === 'rejected_customer') return 'Rejected (customer)';
    if (st === 'sent') return 'Sent';
    if (st === 'draft') return 'Draft';
    if (st === 'expired') return 'Expired';
    if (st === 'accepted') return 'Accepted';
    if (st === 'rejected') return 'Rejected';
    if (!st) return status ?? '';
    return `${st.charAt(0).toUpperCase()}${st.slice(1)}`;
  })();
  const channelLabel =
    confirmationChannel === 'email'
      ? 'email'
      : confirmationChannel === 'phone'
        ? 'phone call'
        : confirmationChannel === 'in_person'
          ? 'in person'
          : null;
  const channelDate =
    st === 'accepted' || st === 'accepted_customer' || st === 'accepted_manual'
      ? (acceptedAt ? formatDisplayDate(acceptedAt) : null)
      : st === 'rejected' || st === 'rejected_customer' || st === 'rejected_manual'
        ? (rejectedAt ? formatDisplayDate(rejectedAt) : null)
        : null;
  const channelSubtext = channelLabel ? `Via ${channelLabel}${channelDate ? ` · ${channelDate}` : ''}` : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-row items-start justify-between gap-3 sm:gap-6">
          {logoSrc ? (
            <div className="shrink-0 pt-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt=""
                className="max-h-12 w-auto max-w-[min(40vw,9rem)] object-contain object-left sm:max-w-[11rem]"
              />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1 items-end text-right sm:max-w-[min(100%,20rem)] sm:shrink-0 sm:flex-none">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Quote</h2>
            <p className="break-words text-xs text-slate-500 dark:text-slate-400">
              {quoteNumber ? (
                <>
                  <span className="font-medium text-slate-700 dark:text-slate-300">Quote #</span> {quoteNumber}
                </>
              ) : (
                <span className="italic">Quote number assigned when you save</span>
              )}
            </p>
            <dl className="mt-1 grid gap-1 text-xs">
              <div className="flex flex-wrap items-baseline justify-end gap-x-2">
                <dt className="shrink-0 text-slate-500 dark:text-slate-400">Issue date</dt>
                <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{formatDisplayDate(issueDate)}</dd>
              </div>
              {expiryDate ? (
                <div className="flex flex-wrap items-baseline justify-end gap-x-2">
                  <dt className="shrink-0 text-slate-500 dark:text-slate-400">Expiry</dt>
                  <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{formatDisplayDate(expiryDate)}</dd>
                </div>
              ) : null}
              <div className="flex flex-wrap items-baseline justify-end gap-x-2">
                <dt className="shrink-0 text-slate-500 dark:text-slate-400">Currency</dt>
                <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{labelForCurrencyCode(code)}</dd>
              </div>
              {status ? (
                <div className="flex flex-wrap items-baseline justify-end gap-x-2">
                  <dt className="shrink-0 text-slate-500 dark:text-slate-400">Status</dt>
                  <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{statusLabel}</dd>
                </div>
              ) : null}
              {channelSubtext ? (
                <div className="text-right text-xs text-gray-500 dark:text-gray-400">{channelSubtext}</div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>

      {showAcceptMeta || showRejectMeta ? (
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5">
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-4 py-3.5 dark:border-slate-700/80 dark:bg-slate-800/40">
            {showAcceptMeta ? (
              <div className="space-y-4">
                {acceptViaValue ? (
                  <ConfirmationMetaRow label="Accepted via" value={acceptViaValue} />
                ) : null}
                {acceptedAt ? (
                  <ConfirmationMetaRow label="Accepted on" value={formatDisplayDate(acceptedAt)} />
                ) : null}
                {acceptedNote?.trim() ? (
                  <ConfirmationMetaRow
                    label={isManualAccepted ? 'Additional note' : 'Note'}
                    value={acceptedNote.trim()}
                  />
                ) : null}
              </div>
            ) : null}
            {showRejectMeta ? (
              <div className="space-y-4">
                {rejectViaValue ? (
                  <ConfirmationMetaRow label="Rejected via" value={rejectViaValue} />
                ) : null}
                {rejectedAt ? (
                  <ConfirmationMetaRow label="Rejected on" value={formatDisplayDate(rejectedAt)} />
                ) : null}
                {rejectionReason?.trim() ? (
                  <ConfirmationMetaRow
                    label={isManualRejected ? 'Additional note' : 'Reason'}
                    value={rejectionReason.trim()}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-row items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:gap-6 sm:px-5 sm:py-5">
        <div className="min-w-0 flex-1 pr-1 sm:pr-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From</p>
          <p className="mt-2 font-semibold text-slate-900">{issuer.name || 'Your business'}</p>
          <div className="mt-2 space-y-2">
            <LinesBlock
              lines={issuerAddr}
              emptyHint="Add your business address in Settings → Profile."
            />
            <LinesBlock lines={issuerContact} />
          </div>
        </div>
        <div className="flex min-w-0 max-w-[min(50%,20rem)] shrink-0 flex-col items-end text-right sm:max-w-[min(100%,20rem)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To</p>
          <div className="mt-2 w-full space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Bill to
              </p>
              <p className="mt-1 break-words font-semibold text-slate-900">{custName}</p>
              {custCompany && custCompany !== custName ? (
                <p className="break-words text-sm text-slate-600">{custCompany}</p>
              ) : null}
              {custEmail ? (
                <p className="mt-1 break-all text-xs text-slate-600 sm:break-words">{custEmail}</p>
              ) : null}
              {custAddrLines.length > 0 ? (
                <div className="mt-2 w-full">
                  <LinesBlock lines={custAddrLines} />
                </div>
              ) : null}
            </div>
            {deliveryAddrLines.length > 0 ? (
              <div className="border-t border-slate-200 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Delivery to
                </p>
                <div className="mt-1 w-full">
                  <LinesBlock lines={deliveryAddrLines} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:hidden">
        {items.map((item, idx) => {
          const qty = Number(item.quantity) || 0;
          const unit = Number(item.unit_price) || 0;
          const amt = item.amount != null ? Number(item.amount) : qty * unit;
          return (
            <div
              key={idx}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="font-medium leading-snug text-slate-900">{item.name}</p>
              {item.description ? (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{item.description}</p>
              ) : null}
              {item.tax_percent != null && Number(item.tax_percent) > 0 ? (
                <p className="mt-2 text-[11px] text-slate-400">Tax {Number(item.tax_percent)}%</p>
              ) : null}
              <dl className="mt-4 space-y-2.5 border-t border-slate-200 pt-4">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <dt className="shrink-0 text-slate-500">Quantity</dt>
                  <dd className="min-w-0 text-right tabular-nums font-medium text-slate-800">{qty}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <dt className="shrink-0 text-slate-500">Unit price</dt>
                  <dd className="min-w-0 text-right tabular-nums text-slate-800">
                    {formatCurrencyAmount(unit, code)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2.5 text-sm">
                  <dt className="shrink-0 font-semibold text-slate-800">Total</dt>
                  <dd className="min-w-0 text-right text-base font-semibold tabular-nums text-slate-900">
                    {formatCurrencyAmount(amt, code)}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto px-2 py-4 sm:block sm:px-4">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
              <th className="px-2 py-2 sm:px-3">Item / Description</th>
              <th className="px-2 py-2 text-right sm:px-3">Qty</th>
              <th className="px-2 py-2 text-right sm:px-3">Unit price</th>
              <th className="px-2 py-2 text-right sm:px-3">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => {
              const qty = Number(item.quantity) || 0;
              const unit = Number(item.unit_price) || 0;
              const amt = item.amount != null ? Number(item.amount) : qty * unit;
              return (
                <tr key={idx}>
                  <td className="px-2 py-2.5 align-top sm:px-3">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                    ) : null}
                    {item.tax_percent != null && Number(item.tax_percent) > 0 ? (
                      <p className="mt-1 text-[11px] text-slate-400">Tax {Number(item.tax_percent)}%</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700 sm:px-3">{qty}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700 sm:px-3">
                    {formatCurrencyAmount(unit, code)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-medium text-slate-900 sm:px-3">
                    {formatCurrencyAmount(amt, code)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 px-4 py-5 sm:px-5 sm:py-4">
        <div className="w-full space-y-3 text-sm sm:ml-auto sm:max-w-xs sm:space-y-1.5">
          <div className="flex justify-between gap-4 text-slate-600">
            <span>Subtotal</span>
            <span className="text-right tabular-nums text-slate-900">{formatCurrencyAmount(subtotal, code)}</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-600">
            <span>Tax</span>
            <span className="text-right tabular-nums text-slate-900">{formatCurrencyAmount(tax, code)}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-4 text-lg font-bold text-slate-900 sm:pt-2 sm:text-base sm:font-semibold">
            <span>Total</span>
            <span className="text-right tabular-nums">{formatCurrencyAmount(total, code)}</span>
          </div>
        </div>
      </div>

      {notes?.trim() ? (
        <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{notes.trim()}</p>
        </div>
      ) : null}
    </div>
  );
}
