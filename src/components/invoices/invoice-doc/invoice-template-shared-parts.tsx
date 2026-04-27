'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { InvoiceDocumentPayload, InvoiceDocTextLine } from '@/lib/invoices/invoice-document-payload';
import type { SavedInvoice } from '@/types/invoice-preview';

export function renderInvoiceBillBlock(lines: InvoiceDocTextLine[]) {
  return (
    <div className="min-w-0 max-w-full p-1.5 md:p-2">
      {lines.map((line, idx) => (
        <p
          key={idx}
          className={
            line.variant === 'section'
              ? 'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'
              : line.variant === 'strong'
                ? 'mt-0.5 break-words text-base font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere] dark:text-white'
                : line.variant === 'muted'
                  ? 'mt-1 break-words text-sm leading-snug text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400'
                  : 'mt-1 break-words text-sm leading-snug text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400'
          }
        >
          <span
            className={
              line.preWrap
                ? 'whitespace-pre-wrap break-words leading-snug [overflow-wrap:anywhere]'
                : 'break-words leading-snug [overflow-wrap:anywhere]'
            }
          >
            {line.text}
          </span>
        </p>
      ))}
    </div>
  );
}

type MetaRowProps = {
  doc: InvoiceDocumentPayload;
  invoice: SavedInvoice;
  showSourceQuoteLink: boolean;
  labelClass: string;
  valueClass: string;
};

const metaRowClass =
  'flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs [overflow-wrap:anywhere]';
const metaLabel = 'shrink-0';
const metaValue = (valueClass: string) =>
  `${valueClass} min-w-0 max-w-[100%] break-words text-right [overflow-wrap:anywhere]`;

export function InvoiceMetaSection({ doc, invoice, showSourceQuoteLink, labelClass, valueClass }: MetaRowProps) {
  const v = metaValue(valueClass);
  return (
    <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
      <div className={metaRowClass}>
        <span className={`${labelClass} ${metaLabel}`}>Invoice #</span>
        <span className={v}>{doc.invoiceMeta.invoiceNumber}</span>
      </div>
      {doc.invoiceMeta.sourceQuoteNumber ? (
        <div className={metaRowClass}>
          <span className={`${labelClass} ${metaLabel}`}>From Quote</span>
          <span className={v}>
            {showSourceQuoteLink && invoice.sourceQuoteId ? (
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
        <div className={metaRowClass}>
          <span className={`${labelClass} ${metaLabel}`}>Reference / PO</span>
          <span className={v}>{doc.invoiceMeta.referencePo}</span>
        </div>
      )}
      <div className={metaRowClass}>
        <span className={`${labelClass} ${metaLabel}`}>Issue date</span>
        <span className={v}>{doc.invoiceMeta.issueDateFormatted}</span>
      </div>
      <div className={metaRowClass}>
        <span className={`${labelClass} ${metaLabel}`}>Due date</span>
        <span className={v}>{doc.invoiceMeta.dueDateFormatted}</span>
      </div>
    </div>
  );
}

export function LineItemsAndRest({
  doc,
  skin,
  childrenAfterMeta,
}: {
  doc: InvoiceDocumentPayload;
  skin: {
    tableHead: string;
    tableRow: string;
    cardBorder: string;
  };
  childrenAfterMeta?: ReactNode;
}) {
  return (
    <div className="w-full min-w-0 max-w-full [overflow-wrap:anywhere]">
      {childrenAfterMeta}
      <div className="mt-4 w-full min-w-0 max-w-full space-y-2 px-2 py-0 sm:mt-6 sm:space-y-2.5 sm:px-3 md:hidden print:hidden">
        {doc.lineItems.map((item, index) => (
          <div
            key={index}
            className={`min-w-0 max-w-full rounded-xl border p-2.5 sm:p-3 ${skin.cardBorder} dark:border-slate-800`}
          >
            <p className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere] text-slate-900 dark:text-white">
              {item.name || '—'}
            </p>
            {item.description ? (
              <p className="mt-1 min-w-0 break-words text-sm [overflow-wrap:anywhere] text-slate-500 dark:text-slate-400">
                {item.description}
              </p>
            ) : null}
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Qty</span>
                <span className="min-w-0 text-right text-slate-800 dark:text-slate-200">{item.quantityDisplay}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Rate</span>
                <span className="min-w-0 text-right text-slate-800 dark:text-slate-200">{item.unitPriceDisplay}</span>
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

      <div className="mt-0 hidden w-full min-w-0 max-w-full overflow-x-auto print:block print:overflow-x-visible md:mt-6 md:block">
        <table className="w-full min-w-0 table-fixed text-xs">
          <colgroup>
            <col className="min-w-0" />
            <col className="w-[12%] sm:w-[12%]" />
            <col className="w-[15%] sm:w-[16%]" />
            <col className="w-11 sm:w-12" />
            <col className="w-[15%] sm:w-[16%]" />
          </colgroup>
          <thead>
            <tr className={skin.tableHead}>
              <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500 sm:px-3 sm:py-3 sm:text-xs dark:text-slate-400">
                Description
              </th>
              <th className="px-1.5 py-2.5 text-right text-[10px] font-semibold uppercase leading-tight text-slate-500 sm:px-3 sm:py-3 sm:text-xs dark:text-slate-400">Qty</th>
              <th className="px-1.5 py-2.5 text-right text-[10px] font-semibold uppercase leading-tight text-slate-500 sm:px-3 sm:py-3 sm:text-xs dark:text-slate-400">Rate</th>
              <th className="px-1.5 py-2.5 text-right text-[10px] font-semibold uppercase leading-tight text-slate-500 sm:px-2 sm:py-3 sm:text-xs dark:text-slate-400">Tax %</th>
              <th className="px-2 py-2.5 text-right text-[10px] font-semibold uppercase leading-tight text-slate-500 sm:px-3 sm:py-3 sm:text-xs dark:text-slate-400">Amount</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${skin.tableRow} dark:divide-slate-800`}>
            {doc.lineItems.map((item, index) => (
              <tr key={index}>
                <td className="min-w-0 break-words px-2 py-2.5 align-top text-slate-900 [overflow-wrap:anywhere] sm:px-3 sm:py-3 dark:text-white">
                  {item.name || '—'}
                  {item.description && (
                    <span className="mt-0.5 block [overflow-wrap:anywhere] break-words text-slate-500 dark:text-slate-400">
                      {item.description}
                    </span>
                  )}
                </td>
                <td className="px-1.5 py-2.5 text-right [overflow-wrap:anywhere] break-words text-slate-700 sm:px-3 sm:py-3 dark:text-slate-300">
                  {item.quantityDisplay}
                </td>
                <td className="px-1.5 py-2.5 text-right [overflow-wrap:anywhere] break-words text-slate-700 sm:px-3 sm:py-3 dark:text-slate-300">
                  {item.unitPriceDisplay}
                </td>
                <td className="px-1.5 py-2.5 text-right text-[10px] tabular-nums text-slate-700 sm:px-2 sm:py-3 sm:text-xs dark:text-slate-300">
                  {item.taxPercentDisplay}
                </td>
                <td className="px-2 py-2.5 text-right text-[10px] font-medium tabular-nums text-slate-900 sm:px-3 sm:py-3 sm:text-xs dark:text-white">
                  {item.lineTotalDisplay}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {doc.timeSummary && doc.timeSummary.rows.length > 0 ? (
        <div className="min-w-0 border-t border-slate-200 bg-slate-50/60 p-2 sm:p-3 md:p-4 dark:border-slate-800 dark:bg-slate-800/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Time Summary</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Work breakdown from hour-based lines above. Invoice totals are calculated in the section below.
          </p>
          <div className="mt-3 space-y-2 text-xs">
            {doc.timeSummary.rows.map((row, idx) => (
              <div
                key={`${row.assignee}-${idx}`}
                className="grid min-w-0 max-w-full grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-baseline sm:gap-x-4 print:grid-cols-[minmax(0,1fr)_auto_auto] print:items-baseline"
              >
                <span className="min-w-0 break-words font-medium [overflow-wrap:anywhere] text-slate-900 dark:text-white">
                  {row.assignee}
                </span>
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

      <div className="min-w-0 border-t border-slate-200 p-2 sm:p-3 md:p-4 dark:border-slate-800">
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
        <div className="min-w-0 border-t border-slate-200 p-2 sm:p-3 md:p-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Payment schedule</p>
          <div className="mt-2 hidden w-full min-w-0 max-w-full overflow-x-auto print:block print:overflow-x-visible md:block">
            <table className="w-full min-w-0 table-fixed text-xs">
              <colgroup>
                <col className="min-w-0" />
                <col className="w-24 sm:w-28" />
                <col className="w-24 sm:w-28" />
                <col className="w-16 sm:w-20" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-0 py-2 pr-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:pr-3 sm:text-xs dark:text-slate-400">
                    Description
                  </th>
                  <th className="px-0 py-2 pr-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:pr-3 sm:text-xs dark:text-slate-400">Amount</th>
                  <th className="px-0 py-2 pr-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:pr-3 sm:text-xs dark:text-slate-400">Due Date</th>
                  <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs dark:text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {doc.schedule.map((r, i) => (
                  <tr key={i}>
                    <td className="min-w-0 break-words py-2 pr-2 align-top [overflow-wrap:anywhere] text-slate-900 sm:pr-3 dark:text-white">
                      {r.description}
                    </td>
                    <td className="px-0 py-2 pr-2 text-right text-[10px] tabular-nums text-slate-900 sm:pr-3 sm:text-xs dark:text-white">
                      {r.amount}
                    </td>
                    <td className="px-0 py-2 pr-2 text-[10px] [overflow-wrap:anywhere] break-words text-slate-600 sm:pr-3 sm:text-xs dark:text-slate-400">
                      {r.dueDate}
                    </td>
                    <td className="px-0 py-2 text-left text-[10px] [overflow-wrap:anywhere] break-words text-slate-600 sm:text-xs dark:text-slate-400">
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2 md:hidden print:hidden">
            {doc.schedule.map((r, i) => (
              <div
                key={i}
                className="min-w-0 max-w-full rounded-xl border border-slate-200 p-2.5 text-sm sm:p-3 dark:border-slate-800"
              >
                <p className="min-w-0 [overflow-wrap:anywhere] break-words font-medium text-slate-900 dark:text-white">
                  {r.description}
                </p>
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
        <div className="min-w-0 border-t border-slate-200 p-2 sm:p-3 md:p-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Notes & terms</p>
          {doc.notesTerms.notes && (
            <p className="mt-1 [overflow-wrap:anywhere] break-words whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">
              {doc.notesTerms.notes}
            </p>
          )}
          {doc.notesTerms.terms && (
            <p className="mt-2 [overflow-wrap:anywhere] break-words whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">
              {doc.notesTerms.terms}
            </p>
          )}
        </div>
      )}

      {doc.paymentMethods && (
        <div className="mt-5 min-w-0 max-w-full p-2 text-xs sm:mt-6 sm:p-3 md:mt-8 md:p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:text-xs">Payment methods</p>
          <div className="mt-3 grid w-full min-w-0 grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4 md:gap-6 print:grid-cols-2">
            {doc.paymentMethods.bankTransfer ? (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 md:text-sm">{doc.paymentMethods.bankTransfer.title}</p>
                <div className="mt-1.5 space-y-1 md:mt-2 md:space-y-1.5">
                  {doc.paymentMethods.bankTransfer.fields.map((field, idx) => (
                    <p key={`${field.label}-${idx}`} className="text-xs md:text-sm">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">{field.label}: </span>
                      <span className="break-words text-xs leading-snug text-slate-700 dark:text-slate-300 md:text-sm">{field.value}</span>
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
                      <span className="break-words text-xs leading-snug text-slate-700 dark:text-slate-300 md:text-sm">{field.value}</span>
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
