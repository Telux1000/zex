'use client';

import type { InvoiceDocumentPayload } from '@/lib/invoices/invoice-document-payload';
import type { InvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';
import type { SavedInvoice } from '@/types/invoice-preview';
import {
  InvoiceMetaSection,
  LineItemsAndRest,
  renderInvoiceBillBlock,
} from './invoice-doc/invoice-template-shared-parts';

const SKIN: Record<
  InvoiceTemplateId,
  { tableHead: string; tableRow: string; cardBorder: string }
> = {
  classic: {
    tableHead: 'border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50',
    tableRow: 'divide-slate-200',
    cardBorder: 'border-slate-200',
  },
  modern: {
    tableHead: 'border-b border-slate-200/90 bg-slate-100/90 dark:border-slate-800 dark:bg-slate-800/40',
    tableRow: 'divide-slate-200/90',
    cardBorder: 'border-slate-200/90',
  },
  minimal: {
    tableHead: 'border-b-2 border-slate-200 bg-white dark:border-slate-700',
    tableRow: 'divide-slate-200/60',
    cardBorder: 'border-slate-200/70',
  },
  bold: {
    tableHead: 'border-b-2 border-slate-900/90 bg-slate-100 dark:border-slate-100 dark:bg-slate-800',
    tableRow: 'divide-slate-200',
    cardBorder: 'border-slate-300',
  },
  elegant: {
    tableHead: 'border-b border-stone-300/80 bg-stone-50/90 dark:border-stone-600 dark:bg-stone-900/20',
    tableRow: 'divide-stone-200/80',
    cardBorder: 'border-stone-200/80',
  },
};

function labelValueClasses(t: InvoiceTemplateId): { label: string; value: string } {
  if (t === 'bold') {
    return { label: 'text-slate-500 dark:text-slate-400', value: 'font-medium text-slate-800 dark:text-slate-200' };
  }
  if (t === 'elegant') {
    return { label: 'text-stone-500 dark:text-stone-400', value: 'text-stone-800 dark:text-stone-200' };
  }
  if (t === 'minimal') {
    return { label: 'text-slate-500 dark:text-slate-500', value: 'text-slate-700 dark:text-slate-300' };
  }
  return { label: 'text-slate-500 dark:text-slate-400', value: 'text-slate-700 dark:text-slate-300' };
}

export type InvoiceDocumentViewProps = {
  doc: InvoiceDocumentPayload;
  invoice: SavedInvoice;
  templateId: InvoiceTemplateId;
  showSourceQuoteLink: boolean;
};

export function InvoiceDocumentView({ doc, invoice, templateId, showSourceQuoteLink }: InvoiceDocumentViewProps) {
  const skin = SKIN[templateId];
  const { label: labelClass, value: valueClass } = labelValueClasses(templateId);
  /** Keeps the card inside flex / grid columns; Bold/Elegant borders need min-w-0 to avoid horizontal overflow. */
  const rootDoc =
    'relative box-border w-full min-w-0 max-w-full overflow-x-hidden [overflow-wrap:anywhere]';

  const voidLayer = doc.voided && (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rotate-[-18deg] rounded-xl border-4 border-slate-400/60 px-6 py-2 text-3xl font-extrabold uppercase tracking-[0.35em] text-slate-400/70 dark:border-slate-500/50 dark:text-slate-500/60">
        Voided
      </div>
    </div>
  );

  const businessNameClass =
    templateId === 'elegant'
      ? 'min-w-0 max-w-full break-words font-serif text-lg font-semibold text-stone-900 sm:text-xl dark:text-stone-100'
      : templateId === 'bold'
        ? 'min-w-0 max-w-full break-words text-lg font-bold tracking-tight text-slate-900 sm:text-xl dark:text-white'
        : 'min-w-0 max-w-full break-words text-base font-semibold text-slate-900 sm:text-lg dark:text-white';

  const companyBlock = (
    <>
      <div
        className={doc.company.logoUrl ? 'flex min-w-0 flex-col items-start gap-0' : 'flex min-w-0 items-center gap-3 sm:gap-4'}
      >
        {doc.company.logoUrl ? (
          <>
            <div className="relative h-12 w-32 shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={doc.company.logoUrl} alt="" className="h-full w-full object-contain object-left" />
            </div>
            <p className={`${businessNameClass} mt-1.5`}>{doc.company.name}</p>
          </>
        ) : (
          <p className={businessNameClass}>{doc.company.name}</p>
        )}
      </div>
      {doc.company.addressLines.length > 0 && (
        <p className="mt-2 min-w-0 max-w-full break-words text-xs [overflow-wrap:anywhere] text-slate-600 dark:text-slate-400">
          {doc.company.addressLines.map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      )}
      {doc.company.taxIdLine && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{doc.company.taxIdLine}</p>}
    </>
  );

  const amountMobile = (
    <div className="min-w-0 border-b border-slate-200 p-2 sm:p-3 md:p-4 dark:border-slate-800 md:hidden print:hidden">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount due</p>
      <p
        className={
          templateId === 'bold'
            ? 'mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white'
            : 'mt-1.5 text-2xl font-bold text-slate-900 dark:text-white'
        }
      >
        {doc.totals.balanceDue}
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Due {doc.invoiceMeta.dueDateFormatted}</p>
    </div>
  );

  const billToBlock = (
    <div
      className={
        templateId === 'minimal'
          ? 'border-b border-slate-200/80 p-3 py-4 sm:p-4 sm:py-5 md:py-6 dark:border-slate-800'
          : 'min-w-0 border-b border-slate-200 p-2 sm:p-3 md:p-4 dark:border-slate-800'
      }
    >
      <p
        className={
          templateId === 'elegant'
            ? 'text-xs font-medium uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400'
            : 'text-xs font-semibold uppercase text-slate-500 dark:text-slate-400'
        }
      >
        Bill to
      </p>
      {doc.billTo.useDeliveryAddress ? (
        <div className="mt-2 grid w-full min-w-0 max-w-full gap-3 md:grid-cols-2">
          {renderInvoiceBillBlock(doc.billTo.billing.lines)}
          {doc.billTo.delivery ? renderInvoiceBillBlock(doc.billTo.delivery.lines) : null}
        </div>
      ) : (
        <div className="mt-2 min-w-0 max-w-full">{renderInvoiceBillBlock(doc.billTo.billing.lines)}</div>
      )}
    </div>
  );

  const metaBlock = (
    <div
      className={
        templateId === 'minimal'
          ? 'border-b border-slate-200/80 p-3 sm:p-4 dark:border-slate-800'
          : 'min-w-0 border-b border-slate-200 p-2 sm:p-3 md:p-4 dark:border-slate-800'
      }
    >
      <InvoiceMetaSection
        doc={doc}
        invoice={invoice}
        showSourceQuoteLink={showSourceQuoteLink}
        labelClass={labelClass}
        valueClass={valueClass}
      />
    </div>
  );

  if (templateId === 'modern') {
    return (
      <div
        className={`${rootDoc} overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:shadow-none`}
      >
        {voidLayer}
        <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-3 sm:p-4 md:px-6 md:py-5 dark:border-slate-800 dark:from-slate-800/30 dark:to-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">{companyBlock}</div>
            <div className="min-w-0 text-left sm:shrink-0 sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Invoice</p>
              <p className="mt-0.5 break-words text-base font-bold text-slate-900 [overflow-wrap:anywhere] sm:text-lg tabular-nums dark:text-white">
                {doc.invoiceMeta.invoiceNumber}
              </p>
            </div>
          </div>
        </div>
        {amountMobile}
        {billToBlock}
        {metaBlock}
        <LineItemsAndRest doc={doc} skin={skin} />
      </div>
    );
  }

  if (templateId === 'minimal') {
    return (
      <div
        className={`${rootDoc} rounded-xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900 print:shadow-none`}
      >
        {voidLayer}
        <div className="p-3 sm:p-4 md:px-8 md:py-6">{companyBlock}</div>
        {amountMobile}
        {billToBlock}
        {metaBlock}
        <LineItemsAndRest doc={doc} skin={skin} />
      </div>
    );
  }

  if (templateId === 'bold') {
    return (
      <div
        className={`${rootDoc} max-md:shadow-none rounded-xl border-2 border-slate-900/80 bg-white md:shadow-md dark:border-slate-200/50 dark:bg-slate-900 print:shadow-none`}
      >
        {voidLayer}
        <div className="min-w-0 border-b-2 border-slate-900/90 bg-slate-50 p-2 sm:p-3 dark:border-slate-100/80 dark:bg-slate-950/20 md:px-6 md:py-4">
          {companyBlock}
        </div>
        {amountMobile}
        {billToBlock}
        {metaBlock}
        <LineItemsAndRest doc={doc} skin={skin} />
      </div>
    );
  }

  if (templateId === 'elegant') {
    return (
      <div
        className={`${rootDoc} max-md:shadow-none rounded-2xl border border-stone-200/90 bg-stone-50/40 md:shadow-sm dark:border-stone-700 dark:bg-stone-950/30 print:shadow-none`}
      >
        {voidLayer}
        <div className="min-w-0 p-2 sm:p-3 md:px-7 md:py-6">{companyBlock}</div>
        {amountMobile}
        {billToBlock}
        {metaBlock}
        <LineItemsAndRest doc={doc} skin={skin} />
      </div>
    );
  }

  /* classic — match legacy dashboard preview */
  return (
    <div
      className={`${rootDoc} rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:shadow-none`}
    >
      {voidLayer}
      <div className="min-w-0 border-b border-slate-200 p-2 sm:p-3 md:p-4 dark:border-slate-800">{companyBlock}</div>
      {amountMobile}
      {billToBlock}
      {metaBlock}
      <LineItemsAndRest doc={doc} skin={skin} />
    </div>
  );
}
