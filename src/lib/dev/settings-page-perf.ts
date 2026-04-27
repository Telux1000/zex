/**
 * Dev-only timing for Settings route (no PII).
 * Enable with NODE_ENV=development (default on) or NEXT_PUBLIC_SETTINGS_PAGE_PERF=1.
 */
export const SETTINGS_PAGE_PERF_PREFIX = '[settings-perf]';

export function isSettingsPagePerfEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SETTINGS_PAGE_PERF === '1') return true;
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.NEXT_PUBLIC_SETTINGS_PAGE_PERF === '0') return false;
  return true;
}

export function settingsPagePerfLog(label: string, detail?: Record<string, string | number | boolean | null>) {
  if (!isSettingsPagePerfEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(`${SETTINGS_PAGE_PERF_PREFIX} ${label}`, { ...detail });
  } else {
    console.info(`${SETTINGS_PAGE_PERF_PREFIX} ${label}`);
  }
}
