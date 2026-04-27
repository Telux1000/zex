/**
 * Development-only labels for end-to-end login → dashboard timing.
 * Do not log PII, tokens, or secrets.
 */
export const LOGIN_PERF_PREFIX = '[login-perf]';

export function isLoginPerfEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.NEXT_PUBLIC_LOGIN_PERF === '0') return false;
  return true;
}

export function loginPerfLog(label: string, detail?: Record<string, string | number | boolean | null>) {
  if (!isLoginPerfEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    const safe = { ...detail };
    console.info(`${LOGIN_PERF_PREFIX} ${label}`, safe);
  } else {
    console.info(`${LOGIN_PERF_PREFIX} ${label}`);
  }
}

/** Client: wall-clock start stored before navigation (sessionStorage, same origin). */
export const LOGIN_PERF_WALL_START_KEY = '__zenzex_login_perf_wall0';

export function markLoginFlowWallStart() {
  if (typeof window === 'undefined' || !isLoginPerfEnabled()) return;
  try {
    window.sessionStorage.setItem(LOGIN_PERF_WALL_START_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function consumeLoginFlowWallStartMs(): number | null {
  if (typeof window === 'undefined' || !isLoginPerfEnabled()) return null;
  try {
    const raw = window.sessionStorage.getItem(LOGIN_PERF_WALL_START_KEY);
    if (raw == null) return null;
    window.sessionStorage.removeItem(LOGIN_PERF_WALL_START_KEY);
    const t0 = Number(raw);
    if (!Number.isFinite(t0)) return null;
    return Date.now() - t0;
  } catch {
    return null;
  }
}
