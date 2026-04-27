'use client';

import { useEffect, useLayoutEffect } from 'react';
import { isSettingsPagePerfEnabled, settingsPagePerfLog } from '@/lib/dev/settings-page-perf';

/**
 * Dev-only: navigation / paint hints after the settings shell mounts on the client.
 */
export function SettingsPerfClient() {
  useLayoutEffect(() => {
    if (!isSettingsPagePerfEnabled()) return;
    settingsPagePerfLog('settings: shell_visible_client_layout_ms', { ms: Math.round(performance.now()) });
  }, []);

  useEffect(() => {
    if (!isSettingsPagePerfEnabled()) return;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.responseStart > 0) {
      settingsPagePerfLog('settings: nav_response_ms', { ms: Math.round(nav.responseStart) });
    }
    settingsPagePerfLog('settings: client_shell_effect_ms', { ms: Math.round(performance.now()) });
  }, []);
  return null;
}
