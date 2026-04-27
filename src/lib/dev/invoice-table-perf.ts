/**
 * Development-only timing for invoice table / list API.
 * Never log customer names, invoice numbers, or other PII — only durations and coarse flags.
 */

const PREFIX = '[invoice-table-perf]';

export function invoiceTablePerfEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function invoiceTablePerfLog(
  label:
    | 'shell_ready'
    | 'fetch_start'
    | 'invoice_list_query'
    | 'count_query'
    | 'enrichment'
    | 'render'
    | 'summary',
  message: string,
  extra?: Record<string, string | number | boolean | null | undefined>
): void {
  if (!invoiceTablePerfEnabled()) return;
  const parts = [`${PREFIX} ${label}`, message];
  if (extra && Object.keys(extra).length > 0) {
    parts.push(JSON.stringify(extra));
  }
  console.log(parts.join(' '));
}

type ServerMark = { label: string; t: number };

/** Server-side bracket timing for GET /api/invoices (dev only). */
export function createInvoiceListServerPerf() {
  const marks: ServerMark[] = [];
  const t0 = Date.now();

  return {
    mark(label: string) {
      marks.push({ label, t: Date.now() });
    },
    /** Durations between consecutive marks + total. */
    summary(extra?: Record<string, number | string | boolean | null>) {
      if (!invoiceTablePerfEnabled()) return;
      const segments: Record<string, number> = {};
      for (let i = 1; i < marks.length; i++) {
        const prev = marks[i - 1]!;
        const cur = marks[i]!;
        segments[`${prev.label}→${cur.label}`] = cur.t - prev.t;
      }
      const total = Date.now() - t0;
      invoiceTablePerfLog('summary', `total_ms=${total}`, {
        ...Object.fromEntries(Object.entries(segments).map(([k, v]) => [k, v] as const)),
        ...(extra as Record<string, string | number | boolean | null | undefined>),
      });
    },
    /** JSON for response body (dev) — numeric only. */
    devPayload(): Record<string, number | string | boolean> {
      const out: Record<string, number | string | boolean> = { total_ms: Date.now() - t0 };
      for (let i = 1; i < marks.length; i++) {
        const prev = marks[i - 1]!;
        const cur = marks[i]!;
        out[`ms_${prev.label}__${cur.label}`] = cur.t - prev.t;
      }
      return out;
    },
  };
}
