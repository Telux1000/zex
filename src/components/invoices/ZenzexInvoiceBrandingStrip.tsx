'use client';

import { ZENZEX_INVOICE_FOOTER_LINE } from '@/lib/invoices/zenzex-invoice-branding';
import type { InvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';

export function ZenzexInvoiceBrandingStrip({ templateId }: { templateId: InvoiceTemplateId }) {
  const borderClass =
    templateId === 'elegant'
      ? 'border-stone-200/60 dark:border-stone-600/50'
      : 'border-slate-200/80 dark:border-slate-800/80';
  const textClass =
    templateId === 'elegant'
      ? 'text-stone-400/90 dark:text-stone-500/85'
      : 'text-slate-400/90 dark:text-slate-500/90';

  return (
    <div
      className={`mt-4 w-full border-t ${borderClass} px-2 pb-3 pt-3 text-center sm:px-3 md:px-4 print:mt-3 print:pb-2 print:pt-2`}
    >
      <p className={`text-[10px] leading-tight print:text-[9px] ${textClass}`}>{ZENZEX_INVOICE_FOOTER_LINE}</p>
    </div>
  );
}
