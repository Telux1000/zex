import { csvLine } from '@/lib/exports/csv-escape';
import { computeInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { computeNumericDiscountForCsv, computeNumericForCsv, formatCsvDate, formatCsvStatus } from '@/lib/invoices/invoice-csv-mappers';

const CSV_HEADER = [
  'Invoice number',
  'Customer',
  'Status',
  'Created at',
  'Issue date',
  'Due date',
  'Currency',
  'Subtotal',
  'Tax',
  'Discount',
  'Total',
  'Amount paid',
  'Balance due',
] as const;

type InvoiceListPipelineRow = Record<string, unknown>;

/** Invoice rows as returned from {@link runInvoiceListDataPipeline} (refund-enriched, before recurring). */
export function buildInvoiceListCsvString(
  invoices: InvoiceListPipelineRow[]
): { body: string; rowCount: number } {
  const lines: string[] = [csvLine([...CSV_HEADER])];
  for (const inv of invoices) {
    const st = String(inv.status ?? '').toLowerCase();
    const totalN = (() => {
      const t = Number((inv as { total?: number | null }).total);
      return Number.isFinite(t) ? t : 0;
    })();
    const amountPaidGross = Math.max(
      0,
      Number(
        (inv as { gross_paid_amount?: number; amount_paid?: number }).gross_paid_amount ??
          (inv as { amount_paid?: number }).amount_paid ??
          0
      )
    );
    const totalRefunded = Math.max(0, Number((inv as { total_refunded?: number }).total_refunded ?? 0));
    const balanceRaw = (inv as { balance_due?: number }).balance_due;
    const balance =
      st === 'voided' || st === 'cancelled'
        ? 0
        : balanceRaw != null && Number.isFinite(Number(balanceRaw))
          ? Math.max(0, Number(balanceRaw))
          : computeInvoiceBalanceDue(
              totalN,
              Number((inv as { amount_paid?: number }).amount_paid ?? 0) || 0,
              totalRefunded
            );

    const createdYmd = formatCsvDate(
      (inv as { created_at?: string | null }).created_at
    );

    lines.push(
      csvLine([
        String((inv as { invoice_number?: string }).invoice_number ?? ''),
        String((inv as { customer_name?: string }).customer_name ?? ''),
        formatCsvStatus((inv as { status?: string }).status),
        createdYmd,
        formatCsvDate((inv as { issue_date?: string | null }).issue_date),
        formatCsvDate((inv as { due_date?: string | null }).due_date),
        String((inv as { currency?: string }).currency ?? '').toUpperCase(),
        computeNumericForCsv(
          (inv as { subtotal?: number | null }).subtotal,
          0
        ),
        computeNumericForCsv(
          (inv as { tax_amount?: number | null }).tax_amount,
          0
        ),
        computeNumericDiscountForCsv(
          (inv as { discount_amount?: number | null }).discount_amount
        ),
        totalN.toFixed(2),
        amountPaidGross.toFixed(2),
        balance.toFixed(2),
      ])
    );
  }
  return { body: lines.join('\r\n') + '\r\n', rowCount: invoices.length };
}

export const MAX_INVOICE_CSV_EXPORT_ROWS = 5000;
