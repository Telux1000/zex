/**
 * Development-only timing for Create → Manual invoice (click to shell / click to ready).
 * No production logs. Do not pass PII in labels.
 */

const LOG_PREFIX = '[manual-invoice-open]';
const CLICK_T0_KEY = '__manualInvoiceOpenClickT0_v1';
const SHELL_LOGGED_KEY = '__manualInvoiceOpenShellLogged_v1';
export function manualInvoiceOpenTimingEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function devSetManualInvoiceOpenClickT0(performanceNow: number = typeof performance !== 'undefined' ? performance.now() : 0): void {
  if (!manualInvoiceOpenTimingEnabled() || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.setItem(CLICK_T0_KEY, String(performanceNow));
    window.sessionStorage.removeItem(SHELL_LOGGED_KEY);
  } catch {
    // ignore
  }
}

/**
 * If there is no Manual link trace (e.g. direct /new?mode=form), set click t0 to now (dev) so open-phase logs still have a reference.
 */
export function devEnsureManualInvoiceOpenClickT0(): void {
  if (!manualInvoiceOpenTimingEnabled() || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    if (window.sessionStorage.getItem(CLICK_T0_KEY) != null) {
      return;
    }
    devSetManualInvoiceOpenClickT0(performance.now());
  } catch {
    // ignore
  }
}

function devGetClickT0FromStorage(): number | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(CLICK_T0_KEY);
    if (raw == null) return null;
    const t = Number(raw);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Elapsed ms since the Manual link click, if a trace is active. Otherwise null.
 */
export function devManualInvoiceOpenElapsedFromClick(
  tNow: number = typeof performance !== 'undefined' ? performance.now() : 0
): number | null {
  if (!manualInvoiceOpenTimingEnabled() || !Number.isFinite(tNow)) {
    return null;
  }
  const t0 = devGetClickT0FromStorage();
  if (t0 == null) {
    return null;
  }
  return tNow - t0;
}

/**
 * One log line with optional meta (ms from click, not since previous mark).
 */
export function devLogManualInvoiceOpen(phase: string, meta?: Record<string, string | number | boolean | null | undefined>): void {
  if (!manualInvoiceOpenTimingEnabled() || typeof performance === 'undefined') {
    return;
  }
  const t0 = devGetClickT0FromStorage();
  const tNow = performance.now();
  if (t0 == null) {
    console.log(`${LOG_PREFIX} ${phase}`, meta && Object.keys(meta).length > 0 ? JSON.stringify(meta) : '');
    return;
  }
  const fromClick = tNow - t0;
  const obj = { fromClickMs: Math.round(fromClick * 10) / 10, ...meta };
  console.log(`${LOG_PREFIX} ${phase} ${JSON.stringify(obj)}`);
}

const shellLoggedRef = { v: false };

/**
 * When the main manual form layout first paints (dev; once per page load / trace).
 */
export function devMarkManualInvoiceFormShellPainted(reason: string): void {
  if (!manualInvoiceOpenTimingEnabled() || typeof window === 'undefined' || typeof performance === 'undefined') {
    return;
  }
  if (devGetClickT0FromStorage() == null) {
    return;
  }
  let canLog = false;
  if (window.sessionStorage) {
    try {
      if (window.sessionStorage.getItem(SHELL_LOGGED_KEY) === '1') {
        return;
      }
      window.sessionStorage.setItem(SHELL_LOGGED_KEY, '1');
      canLog = true;
    } catch {
      if (shellLoggedRef.v) return;
      shellLoggedRef.v = true;
      canLog = true;
    }
  } else {
    if (shellLoggedRef.v) return;
    shellLoggedRef.v = true;
    canLog = true;
  }
  if (!canLog) return;
  devLogManualInvoiceOpen('form_shell_first_paint', { reason });
}

export function devMarkManualInvoiceOpenFullyReady(ctx: { slowestBlockingStep: string; slowestBlockingMs: number; phases: string[] }): void {
  if (!manualInvoiceOpenTimingEnabled() || typeof window === 'undefined') {
    return;
  }
  const t0 = devGetClickT0FromStorage();
  if (t0 == null) {
    return;
  }
  const tNow = performance.now();
  const totalMs = Math.round((tNow - t0) * 10) / 10;
  console.log(
    `${LOG_PREFIX} summary ${JSON.stringify({
      clickToFormReadyMs: totalMs,
      slowestBlockingStep: ctx.slowestBlockingStep,
      slowestBlockingMs: Math.round(ctx.slowestBlockingMs * 10) / 10,
      phaseOrder: ctx.phases,
    })}`
  );
}

/**
 * `billing` hook resolved (not blocking the form, informational).
 */
export function devLogManualInvoiceOpenBillingProfileReady(plan: string, loadingMs: number): void {
  if (!manualInvoiceOpenTimingEnabled()) {
    return;
  }
  devLogManualInvoiceOpen('billing_profile_ready', { plan, profileFetchMs: Math.round(loadingMs * 10) / 10 });
}
