/**
 * Development-only timing for saved-invoice PDF download (client).
 * No PII — only durations in milliseconds. Server PDF work is inside `fetch_settled_ms` (not split here).
 */

const PREFIX = '[invoice-download-perf]';

export function invoiceDownloadPerfEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

type DownloadStepKey =
  | 'click_received'
  | 'loading_state_set'
  | 'first_paint_yield_done'
  | 'heavy_work_started'
  | 'download_complete';

/**
 * Sequenced lifecycle logs. `since_t0_ms` is ms from the original click (same origin as t0 in click handler).
 */
export function logInvoiceDownloadStep(step: DownloadStepKey, since_t0_ms: number): void {
  if (!invoiceDownloadPerfEnabled()) return;
  console.log(
    `${PREFIX} ${step}`,
    JSON.stringify({ since_t0_ms: Math.round(since_t0_ms * 10) / 10 })
  );
}

export function logInvoiceDownloadComplete(timings: {
  /** click → `fetch` promise resolved. Includes network + server PDF generation. */
  fetch_settled_ms: number;
  /** `res.blob()` (body read / buffer). */
  blob_read_ms: number;
  /** createObjectURL, anchor click, revokeObjectURL. */
  file_handoff_ms: number;
  /** click → after revoke. */
  total_download_ms: number;
}): void {
  if (!invoiceDownloadPerfEnabled()) return;
  console.log(
    `${PREFIX} complete`,
    JSON.stringify({
      fetch_settled_ms: Math.round(timings.fetch_settled_ms * 10) / 10,
      blob_read_ms: Math.round(timings.blob_read_ms * 10) / 10,
      file_handoff_ms: Math.round(timings.file_handoff_ms * 10) / 10,
      total_download_ms: Math.round(timings.total_download_ms * 10) / 10,
    })
  );
}

export function logInvoiceDownloadError(
  phase: 'profile' | 'fetch' | 'parse',
  at_ms: number,
  reason?: 'failed' | 'blocked'
): void {
  if (!invoiceDownloadPerfEnabled()) return;
  console.log(
    `${PREFIX} error`,
    JSON.stringify({
      phase,
      at_ms: Math.round(at_ms * 10) / 10,
      ...(reason != null && { reason }),
    })
  );
}
