/**
 * Development-only timing for the invoice save path.
 * No logs in production; do not pass PII into `summary` / labels.
 */
const LOG_PREFIX = '[invoice-save]';

const CLIENT_CLICK_TRACE_KEY = '__invoiceSaveClickTrace_v1';

export function invoiceSaveTimingEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

/** Clear any pending per-save trace (dev). Call at start of save submit. */
export function devClearInvoiceSaveClickTrace(): void {
  if (!invoiceSaveTimingEnabled() || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.removeItem(CLIENT_CLICK_TRACE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Store the performance.now() origin for "click save" (dev) before navigation
 * so the destination page can log click → toast / RSC.
 */
export function devSetInvoiceSaveClickTrace(clickT0: number): void {
  if (!invoiceSaveTimingEnabled() || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.setItem(CLIENT_CLICK_TRACE_KEY, JSON.stringify({ t0: clickT0 }));
  } catch {
    // ignore
  }
}

/**
 * Log elapsed from stored clickT0 (dev). Does not clear; use to bracket navigation vs paint.
 */
export function devLogInvoiceSaveClickFromTraceNoClear(label: string): void {
  if (!invoiceSaveTimingEnabled() || typeof performance === 'undefined' || typeof window === 'undefined') {
    return;
  }
  let t0: number;
  try {
    const raw = window.sessionStorage?.getItem(CLIENT_CLICK_TRACE_KEY);
    if (!raw) return;
    t0 = (JSON.parse(raw) as { t0: number }).t0;
  } catch {
    return;
  }
  const ms = performance.now() - t0;
  console.log(`${LOG_PREFIX} client ${label} +${ms.toFixed(1)}ms (from save click)`);
}

/**
 * Log elapsed ms from the stored clickT0, then clear trace (one-shot, dev only).
 * Use after saved preview is visible (e.g. rAF) so the label is meaningful.
 */
export function devLogAndClearInvoiceSaveClickTrace(label: string): void {
  if (!invoiceSaveTimingEnabled() || typeof performance === 'undefined' || typeof window === 'undefined') {
    return;
  }
  let t0: number;
  try {
    const raw = window.sessionStorage?.getItem(CLIENT_CLICK_TRACE_KEY);
    if (!raw) return;
    t0 = (JSON.parse(raw) as { t0: number }).t0;
  } catch {
    return;
  }
  const ms = performance.now() - t0;
  console.log(`${LOG_PREFIX} client ${label} +${ms.toFixed(1)}ms (from save click, one-shot)`);
  try {
    window.sessionStorage.removeItem(CLIENT_CLICK_TRACE_KEY);
  } catch {
    // ignore
  }
}

type Segment = { label: string; ms: number };

function createNoopServerTimer() {
  return {
    mark: () => {},
    markAsync: async <T,>(_label: string, fn: () => Promise<T>): Promise<T> => fn(),
    summary: (_: InvoiceSaveServerSummaryMeta) => {},
    summaryDeferred: (_: InvoiceSaveServerSummaryMeta & { kind: string }) => {},
  };
}

export type InvoiceSaveServerSummaryMeta = {
  lineItemCount: number;
  customerMode: 'none' | 'lookup_only' | 'lookup_deduped' | 'new_or_unlinked' | 'unknown';
  hasPaymentSchedule?: boolean;
  /** last 4 chars of uuid for correlation without exposing id */
  invoiceIdSuffix?: string;
};

/**
 * Per-request server timer. Each `mark` logs segment time since the previous `mark` / `markAsync`.
 * Use at major await boundaries. `summary` logs total wall time, slowest segment, and steps ≥ 1000ms.
 */
export function createServerInvoiceSaveTimer(
  route: 'POST' | 'PATCH' | 'PATCH-deferred' | 'POST-deferred',
  opts?: { invoiceIdSuffix?: string }
) {
  if (!invoiceSaveTimingEnabled()) return createNoopServerTimer();

  const t0 = performance.now();
  let last = t0;
  const segments: Segment[] = [];
  const suffix = opts?.invoiceIdSuffix;

  const log = (line: string) => {
    const suff = suffix ? ` id:…${suffix}` : '';
    console.log(`${LOG_PREFIX} server:${route}${suff} ${line}`);
  };

  const mark = (label: string) => {
    const now = performance.now();
    const ms = now - last;
    segments.push({ label, ms });
    last = now;
    log(`step:${label} +${ms.toFixed(1)}ms`);
  };

  const markAsync = async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    const t = performance.now();
    try {
      return await fn();
    } finally {
      const ms = performance.now() - t;
      segments.push({ label, ms });
      last = performance.now();
      log(`step:${label} +${ms.toFixed(1)}ms`);
    }
  };

  const buildSummary = (meta: InvoiceSaveServerSummaryMeta) => {
    const totalMs = performance.now() - t0;
    if (segments.length === 0) {
      return {
        totalMs,
        slowestStep: 'none' as const,
        slowestStepMs: 0,
        over1s: [] as string[],
      };
    }
    const slowest = segments.reduce((a, b) => (b.ms > a.ms ? b : a), segments[0]!);
    const over1s = segments.filter((s) => s.ms >= 1000).map((s) => s.label);
    return { totalMs, slowestStep: slowest.label, slowestStepMs: slowest.ms, over1s };
  };

  const summary = (meta: InvoiceSaveServerSummaryMeta) => {
    const s = buildSummary(meta);
    console.log(
      `${LOG_PREFIX} server:${route} summary ${JSON.stringify({
        totalMs: Math.round(s.totalMs * 10) / 10,
        slowestStep: s.slowestStep,
        slowestStepMs: Math.round(s.slowestStepMs * 10) / 10,
        stepsOver1000ms: s.over1s,
        lineItemCount: meta.lineItemCount,
        customerMode: meta.customerMode,
        hasPaymentSchedule: Boolean(meta.hasPaymentSchedule),
        invoiceIdSuffix: meta.invoiceIdSuffix,
      })}`
    );
  };

  const summaryDeferred = (meta: InvoiceSaveServerSummaryMeta & { kind: string }) => {
    const s = buildSummary(meta);
    console.log(
      `${LOG_PREFIX} server:PATCH-deferred kind:${meta.kind} ${JSON.stringify({
        wallMs: Math.round(s.totalMs * 10) / 10,
        slowestStep: s.slowestStep,
        slowestStepMs: Math.round(s.slowestStepMs * 10) / 10,
        stepsOver1000ms: s.over1s,
      })}`
    );
  };

  return { mark, markAsync, summary, summaryDeferred, markRaw: mark };
}

const noopClient = { mark: () => {}, markDuration: () => {}, totalFromStart: () => {} };

/** Client: segment timing from first mark; log total in `totalFromStart`. */
export function createClientInvoiceSaveTimer() {
  if (!invoiceSaveTimingEnabled() || typeof performance === 'undefined') {
    return noopClient;
  }
  const t0 = performance.now();
  let last = t0;
  return {
    mark: (label: string) => {
      const now = performance.now();
      const ms = now - last;
      last = now;
      console.log(`${LOG_PREFIX} client ${label} +${ms.toFixed(1)}ms`);
    },
    markDuration: (label: string, ms: number) => {
      last = performance.now();
      console.log(`${LOG_PREFIX} client ${label} (block) +${ms.toFixed(1)}ms`);
    },
    totalFromStart: (label: string) => {
      console.log(`${LOG_PREFIX} client ${label} total from click +${(performance.now() - t0).toFixed(1)}ms`);
    },
  };
}

/** Measure async work (e.g. void saved-line sync) for logging only. */
export async function timeAsyncDevOnly(
  label: string,
  route: 'POST' | 'PATCH' | 'background',
  fn: () => Promise<void>
): Promise<void> {
  if (!invoiceSaveTimingEnabled()) {
    await fn();
    return;
  }
  const t = performance.now();
  try {
    await fn();
  } finally {
    const ms = performance.now() - t;
    const bg = route === 'background' ? ' background' : '';
    console.log(`${LOG_PREFIX} server:${route}${bg} ${label} +${ms.toFixed(1)}ms`);
  }
}

/** Log wall time when a fire-and-forget promise completes (dev only). */
export function voidLogAsyncDuration(
  kind: 'saved_line_items_sync' | string,
  promise: Promise<unknown>
): void {
  if (!invoiceSaveTimingEnabled()) {
    void promise;
    return;
  }
  const t = performance.now();
  void promise
    .then(() => {
      const ms = performance.now() - t;
      console.log(
        `${LOG_PREFIX} server:background kind:${kind} +${ms.toFixed(1)}ms (non-blocking, completes after response)`
      );
    })
    .catch((e) => {
      const ms = performance.now() - t;
      console.log(
        `${LOG_PREFIX} server:background kind:${kind} +${ms.toFixed(1)}ms failed: ${e instanceof Error ? e.message : 'error'}`
      );
    });
}
