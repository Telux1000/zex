/**
 * Development-only timing: Create → AI-assisted invoice chat (click → shell / input / context).
 * No production logs. Do not pass PII in labels.
 */

const LOG_PREFIX = '[assistant-invoice-chat]';
const CLICK_T0_KEY = '__assistantInvoiceChatClickT0_v1';
const SUMMARY_KEY = '__assistantInvoiceChatSummaryLogged_v1';
const SHELL_FROM_CLICK_MS_KEY = '__assistantChatShellFromClickMs_v1';
const INPUT_FROM_CLICK_MS_KEY = '__assistantChatInputFromClickMs_v1';

const shellLoggedRef = { v: false };
const inputLoggedRef = { v: false };
const contextLoggedRef = { v: false };

export function assistantInvoiceChatTimingEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function devSetAssistantInvoiceChatClickT0(
  performanceNow: number = typeof performance !== 'undefined' ? performance.now() : 0
): void {
  if (!assistantInvoiceChatTimingEnabled() || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.setItem(CLICK_T0_KEY, String(performanceNow));
    window.sessionStorage.removeItem(SUMMARY_KEY);
    window.sessionStorage.removeItem(SHELL_FROM_CLICK_MS_KEY);
    window.sessionStorage.removeItem(INPUT_FROM_CLICK_MS_KEY);
  } catch {
    // ignore
  }
  shellLoggedRef.v = false;
  inputLoggedRef.v = false;
  contextLoggedRef.v = false;
}

export function devEnsureAssistantInvoiceChatClickT0(): void {
  if (!assistantInvoiceChatTimingEnabled() || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    if (window.sessionStorage.getItem(CLICK_T0_KEY) != null) return;
    devSetAssistantInvoiceChatClickT0(performance.now());
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

/** Elapsed ms since hub “AI-assisted” click (session `performance.now()` anchor), or null if untraced. */
export function devAssistantChatElapsedFromClickNow(): number | null {
  if (!assistantInvoiceChatTimingEnabled() || typeof performance === 'undefined') {
    return null;
  }
  const t0 = devGetClickT0FromStorage();
  if (t0 == null) return null;
  return Math.round((performance.now() - t0) * 10) / 10;
}

export function devLogAssistantInvoiceChatPhase(
  phase: string,
  meta?: Record<string, string | number | boolean | null | undefined>
): void {
  if (!assistantInvoiceChatTimingEnabled() || typeof performance === 'undefined') {
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

function devStoreTimingMs(key: string, ms: number): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(key, String(ms));
  } catch {
    // ignore
  }
}

export function devMarkAssistantChatShellVisible(reason: string): void {
  if (!assistantInvoiceChatTimingEnabled()) return;
  if (shellLoggedRef.v) return;
  shellLoggedRef.v = true;
  const t0 = devGetClickT0FromStorage();
  if (t0 != null && typeof performance !== 'undefined') {
    devStoreTimingMs(SHELL_FROM_CLICK_MS_KEY, Math.round((performance.now() - t0) * 10) / 10);
  }
  devLogAssistantInvoiceChatPhase('chat_shell_first_paint', { reason });
}

export function devMarkAssistantChatInputReady(reason: string): void {
  if (!assistantInvoiceChatTimingEnabled()) return;
  if (inputLoggedRef.v) return;
  inputLoggedRef.v = true;
  const t0 = devGetClickT0FromStorage();
  if (t0 != null && typeof performance !== 'undefined') {
    devStoreTimingMs(INPUT_FROM_CLICK_MS_KEY, Math.round((performance.now() - t0) * 10) / 10);
  }
  devLogAssistantInvoiceChatPhase('input_ready', { reason });
}

export function devMarkAssistantChatFullContextReady(reason: string): void {
  if (!assistantInvoiceChatTimingEnabled()) return;
  if (contextLoggedRef.v) return;
  contextLoggedRef.v = true;
  devLogAssistantInvoiceChatPhase('full_context_ready', { reason });
  const fullMs = devAssistantChatElapsedFromClickNow();
  if (fullMs == null || typeof window === 'undefined' || !window.sessionStorage) return;
  let shellMs = fullMs;
  let inputMs = fullMs;
  try {
    const s = window.sessionStorage.getItem(SHELL_FROM_CLICK_MS_KEY);
    const i = window.sessionStorage.getItem(INPUT_FROM_CLICK_MS_KEY);
    if (s != null && Number.isFinite(Number(s))) shellMs = Number(s);
    if (i != null && Number.isFinite(Number(i))) inputMs = Number(i);
  } catch {
    // ignore
  }
  devLogAssistantChatSummary({
    clickToShellMs: shellMs,
    clickToInputMs: inputMs,
    clickToFullContextMs: fullMs,
    slowestBlockingStep: 'max_of_phase_fromClickMs_in_console',
    slowestBlockingMs: Math.max(shellMs, inputMs, fullMs),
    movedOffBlockingPath: [
      'customer_list_no_longer_blocks_chat_mount',
      'supabase_thread_fetch_non_blocking_after_local',
      'empty_thread_opening_postwizard_non_blocking_composer',
      'pdf_export_dynamic_import',
    ],
  });
}

export function devLogAssistantChatSummary(ctx: {
  clickToShellMs: number;
  clickToInputMs: number;
  clickToFullContextMs: number;
  slowestBlockingStep: string;
  slowestBlockingMs: number;
  movedOffBlockingPath: string[];
}): void {
  if (!assistantInvoiceChatTimingEnabled() || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    if (window.sessionStorage.getItem(SUMMARY_KEY) === '1') return;
    window.sessionStorage.setItem(SUMMARY_KEY, '1');
  } catch {
    // ignore duplicate
  }
  console.log(`${LOG_PREFIX} summary ${JSON.stringify(ctx)}`);
}

export function devResetAssistantChatPaintFlagsForTest(): void {
  shellLoggedRef.v = false;
  inputLoggedRef.v = false;
  contextLoggedRef.v = false;
}
