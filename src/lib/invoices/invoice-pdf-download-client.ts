/**
 * Isolated from the download button so it can be loaded via `import()` after the
 * first frame paints (keeps the click path free of I/O before UI feedback).
 */

export type SavedInvoiceDownloadTimings = {
  fetch_settled_ms: number;
  blob_read_ms: number;
  file_handoff_ms: number;
};

/**
 * Fetches the server-generated PDF, materializes a Blob, and triggers a file download.
 * No invoice math. The PDF is produced from the same `InvoiceRenderer` as print (headless
 * Chrome) unless the server is configured with `INVOICE_PDF_ENGINE=pdflib`.
 */
export async function runSavedInvoicePdfDownload(opts: {
  invoiceId: string;
  /** e.g. `invoice-ACME-12.pdf` */
  downloadFileName: string;
}): Promise<SavedInvoiceDownloadTimings> {
  const { invoiceId, downloadFileName } = opts;
  const tFetch0 = performance.now();
  const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`);
  const tAfterFetch = performance.now();
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'download failed');
  }
  if (process.env.NODE_ENV === 'development') {
    const tid = res.headers.get('X-Invoice-Template-Id') ?? 'unknown';
    const rend = res.headers.get('X-Invoice-Renderer') ?? 'unknown';
    console.log(`[invoice-download] template_id=${tid} renderer=${rend}`);
  }
  const tBlob0 = performance.now();
  const blob = await res.blob();
  const tAfterBlob = performance.now();
  const tHandoff0 = performance.now();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadFileName;
  a.click();
  URL.revokeObjectURL(url);
  const tEnd = performance.now();
  return {
    fetch_settled_ms: tAfterFetch - tFetch0,
    blob_read_ms: tAfterBlob - tBlob0,
    file_handoff_ms: tEnd - tHandoff0,
  };
}
