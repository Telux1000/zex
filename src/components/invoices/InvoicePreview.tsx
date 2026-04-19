'use client';

import Link from 'next/link';
import { buildInvoiceDocumentPayload } from '@/lib/invoices/invoice-document-payload';
import type { InvoiceDocTextLine } from '@/lib/invoices/invoice-document-payload';
import type { SavedBusiness, SavedInvoice, SavedInvoiceItem } from '@/types/invoice-preview';
export type {
  SavedBusiness,
  SavedInvoiceMetadata,
  SavedInvoice,
  SavedInvoiceItem,
} from '@/types/invoice-preview';

type InvoicePreviewSavedProps = {
  source: 'saved';
  data: {
    business: SavedBusiness;
    invoice: SavedInvoice;
    items: SavedInvoiceItem[];
  };
};

export function InvoicePreviewSaved({ data }: InvoicePreviewSavedProps) {
  const doc = buildInvoiceDocumentPayload(data);
  const { invoice } = data;

  function renderBillBlock(lines: InvoiceDocTextLine[]) {
    return (
      <div className="p-1.5 md:p-2">
        {lines.map((line, idx) => (
          <p
            key={idx}
            className={
              line.variant === 'section'
                ? 'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'
                : line.variant === 'strong'
                  ? 'mt-0.5 text-base font-semibold leading-snug text-slate-900 dark:text-white'
                  : line.variant === 'muted'
                    ? 'mt-1 text-sm leading-snug text-slate-500 dark:text-slate-400'
                    : 'mt-1 text-sm leading-snug text-slate-600 dark:text-slate-400'
            }
          >
            <span className={line.preWrap ? 'whitespace-pre-wrap leading-snug' : 'leading-snug'}>{line.text}</span>
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:shadow-none">
      {doc.voided && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rotate-[-18deg] rounded-xl border-4 border-slate-400/60 px-6 py-2 text-3xl font-extrabold uppercase tracking-[0.35em] text-slate-400/70 dark:border-slate-500/50 dark:text-slate-500/60">
            Voided
          </div>
        </div>
      )}
      <div className="border-b border-slate-200 p-3 md:p-4 dark:border-slate-800">
        <div className="flex items-center gap-4">
          {doc.company.logoUrl ? (
            <div className="relative h-12 w-32 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doc.company.logoUrl}
                alt={doc.company.name}
                className="h-full w-full object-contain object-left"
              />
            </div>
          ) : (
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{doc.company.name}</p>
          )}
        </div>
        {doc.company.addressLines.length > 0 && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {doc.company.addressLines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        )}
        {doc.company.taxIdLine && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{doc.company.taxIdLine}</p>
        )}
      </div>

      <div className="border-b border-slate-200 p-3 md:p-4 dark:border-slate-800 md:hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount due</p>
        <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">{doc.totals.balanceDue}</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Due {doc.invoiceMeta.dueDateFormatted}
        </p>
      </div>

      <div className="border-b border-slate-200 p-3 md:p-4 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Bill to</p>
        {doc.billTo.useDeliveryAddress ? (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {renderBillBlock(doc.billTo.billing.lines)}
            {doc.billTo.delivery ? renderBillBlock(doc.billTo.delivery.lines) : null}
          </div>
        ) : (
          <div className="mt-2">{renderBillBlock(doc.billTo.billing.lines)}</div>
        )}
      </div>

      <div className="border-b border-slate-200 p-3 md:p-4 dark:border-slate-800">
        <div className="flex flex-wrap justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Invoice #</span>
          <span className="text-slate-700 dark:text-slate-300">{doc.invoiceMeta.invoiceNumber}</span>
        </div>

        {doc.invoiceMeta.sourceQuoteNumber ? (
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">From Quote</span>
            <span className="text-slate-700 dark:text-slate-300">
              {invoice.sourceQuoteId ? (
                <Link
                  href={`/dashboard/quotes/${invoice.sourceQuoteId}`}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400 print:font-normal print:text-slate-700 print:no-underline"
                >
                  {doc.invoiceMeta.sourceQuoteNumber}
                </Link>
              ) : (
                doc.invoiceMeta.sourceQuoteNumber
              )}
            </span>
          </div>
        ) : null}

        {doc.invoiceMeta.referencePo && (
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Reference / PO</span>
            <span className="text-slate-700 dark:text-slate-300">{doc.invoiceMeta.referencePo}</span>
          </div>
        )}
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Issue date</span>
          <span className="text-slate-700 dark:text-slate-300">{doc.invoiceMeta.issueDateFormatted}</span>
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Due date</span>
          <span className="text-slate-700 dark:text-slate-300">{doc.invoiceMeta.dueDateFormatted}</span>
        </div>
      </div>

      <div className="mt-6 space-y-2.5 p-3 md:hidden">
        {doc.lineItems.map((item, index) => (
          <div
            key={index}
            className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name || '—'}</p>
            {item.description ? (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
            ) : null}
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Quantity</span>
                <span className="tabular-nums">{item.quantity}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Unit</span>
                <span className="text-right">{item.unitLabelDisplay}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Rate</span>
                <span className="tabular-nums">{item.unitPriceDisplay}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Tax</span>
                <span className="tabular-nums">{item.taxPercentDisplay}</span>
              </div>
              <div className="flex items-center justify-between pt-1 text-sm font-semibold text-slate-900 dark:text-white">
                <span>Amount</span>
                <span className="tabular-nums">{item.lineTotalDisplay}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="min-w-full table-fixed text-xs">
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-14" />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-14" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Description
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Quantity
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Unit
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Rate
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Tax %
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {doc.lineItems.map((item, index) => (
              <tr key={index}>
                <td className="px-4 py-3 text-slate-900 dark:text-white">
                  {item.name || '—'}
                  {item.description && (
                    <span className="mt-0.5 block text-slate-500 dark:text-slate-400">{item.description}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {item.quantity}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                  {item.unitLabelDisplay}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {item.unitPriceDisplay}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {item.taxPercentDisplay}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                  {item.lineTotalDisplay}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {doc.timeSummary && doc.timeSummary.rows.length > 0 ? (
        <div className="border-t border-slate-200 bg-slate-50/60 p-3 md:p-4 dark:border-slate-800 dark:bg-slate-800/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Time Summary</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Work breakdown from hour-based lines above. Invoice totals are calculated in the section below.
          </p>
          <div className="mt-3 space-y-2 text-xs">
            {doc.timeSummary.rows.map((row, idx) => (
              <div
                key={`${row.assignee}-${idx}`}
                className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-baseline sm:gap-x-4"
              >
                <span className="font-medium text-slate-900 dark:text-white">{row.assignee}</span>
                <span className="text-right tabular-nums text-slate-600 dark:text-slate-400 sm:text-left">{row.detail}</span>
                <span className="text-right tabular-nums font-medium text-slate-900 dark:text-white">{row.amount}</span>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-2 dark:border-slate-700" />
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <span>{doc.timeSummary.footer.label}</span>
              <span className="tabular-nums">{doc.timeSummary.footer.hours}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-t border-slate-200 p-3 md:p-4 dark:border-slate-800">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice totals</p>
        <div className="space-y-2 text-sm md:text-xs">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Subtotal</span>
            <span className="tabular-nums">{doc.totals.subtotal}</span>
          </div>
          {doc.totals.discountLine && (
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>{doc.totals.discountLine.label}</span>
              <span className="tabular-nums">{doc.totals.discountLine.amount}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>{doc.totals.taxLine.label}</span>
            <span className="tabular-nums">{doc.totals.taxLine.amount}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold dark:border-slate-700">
            <span>Total</span>
            <span className="tabular-nums">{doc.totals.total}</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Paid</span>
            <span className="tabular-nums">{doc.totals.paid}</span>
          </div>
          {doc.totals.refunded ? (
            <div className="flex justify-between text-rose-700 dark:text-rose-300">
              <span>Refunded</span>
              <span className="tabular-nums">{doc.totals.refunded}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-slate-900 dark:text-white">
            <span className="font-medium">Balance due</span>
            <span className="tabular-nums font-medium">{doc.totals.balanceDue}</span>
          </div>
          {doc.totals.earlyPayment && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/30">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Original total</span>
                <span className="tabular-nums">{doc.totals.earlyPayment.originalTotal}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-400">
                <span>{doc.totals.earlyPayment.discountLabel}</span>
                <span className="tabular-nums">{doc.totals.earlyPayment.discountAmount}</span>
              </div>
              <div className="mt-1 flex justify-between font-medium text-slate-900 dark:text-white">
                <span>Effective payable</span>
                <span className="tabular-nums">{doc.totals.earlyPayment.payableAmount}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{doc.totals.earlyPayment.footnote}</p>
            </div>
          )}
        </div>
      </div>

      {doc.schedule && doc.schedule.length > 0 && (
        <div className="border-t border-slate-200 p-3 md:p-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Payment schedule</p>
          <div className="mt-2 overflow-x-auto hidden md:block">
            <table className="min-w-full table-fixed text-xs">
              <colgroup>
                <col />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 pr-3 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Description
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Amount
                  </th>
                  <th className="py-2 pr-3 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Due Date
                  </th>
                  <th className="py-2 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {doc.schedule.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-slate-900 dark:text-white">{r.description}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-900 dark:text-white">{r.amount}</td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{r.dueDate}</td>
                    <td className="py-2 whitespace-nowrap text-slate-600 dark:text-slate-400">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2 md:hidden">
            {doc.schedule.map((r, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                <p className="font-medium text-slate-900 dark:text-white">{r.description}</p>
                <div className="mt-1 space-y-1 text-slate-600 dark:text-slate-400">
                  <p>Amount: {r.amount}</p>
                  <p>Due: {r.dueDate}</p>
                  <p>Status: {r.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {doc.notesTerms && (doc.notesTerms.notes || doc.notesTerms.terms) && (
        <div className="border-t border-slate-200 p-3 md:p-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Notes & terms</p>
          {doc.notesTerms.notes && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{doc.notesTerms.notes}</p>
          )}
          {doc.notesTerms.terms && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{doc.notesTerms.terms}</p>
          )}
        </div>
      )}

      {doc.paymentMethods && (
        <div className="mt-6 p-3 text-xs md:mt-8 md:p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:text-xs">
            Payment methods
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:mt-4 md:gap-6">
            {doc.paymentMethods.bankTransfer ? (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 md:text-sm">
                  {doc.paymentMethods.bankTransfer.title}
                </p>
                <div className="mt-1.5 space-y-1 md:mt-2 md:space-y-1.5">
                  {doc.paymentMethods.bankTransfer.fields.map((field, idx) => (
                    <p key={`${field.label}-${idx}`} className="text-xs md:text-sm">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">{field.label}: </span>
                      <span className="break-words leading-snug text-xs text-slate-700 dark:text-slate-300 md:text-sm">{field.value}</span>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {doc.paymentMethods.internationalBankTransfer ? (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 md:text-sm">
                  {doc.paymentMethods.internationalBankTransfer.title}
                </p>
                <div className="mt-1.5 space-y-1 md:mt-2 md:space-y-1.5">
                  {doc.paymentMethods.internationalBankTransfer.fields.map((field, idx) => (
                    <p key={`${field.label}-${idx}`} className="text-xs md:text-sm">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">{field.label}: </span>
                      <span className="break-words leading-snug text-xs text-slate-700 dark:text-slate-300 md:text-sm">{field.value}</span>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {doc.paymentMethods.additionalBlocks.length > 0 ? (
            <div className="mt-5 space-y-3">
              {doc.paymentMethods.additionalBlocks.map((block, bi) => (
                <div key={bi}>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{block.title}</p>
                  <div className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                    {block.lines.map((ln, li) => (
                      <p key={li} className={block.title === 'Additional instructions' ? 'whitespace-pre-wrap' : undefined}>
                        {ln}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
