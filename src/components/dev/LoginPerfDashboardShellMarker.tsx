'use client';

import { useEffect, useRef } from 'react';
import {
  consumeLoginFlowWallStartMs,
  isLoginPerfEnabled,
  loginPerfLog,
} from '@/lib/dev/login-perf';

/**
 * Fires once when the dashboard client shell has mounted (first paint of interactive layout).
 */
export function LoginPerfDashboardShellMarker() {
  const did = useRef(false);
  useEffect(() => {
    if (did.current) return;
    did.current = true;
    if (!isLoginPerfEnabled()) return;
    const wallMs = consumeLoginFlowWallStartMs();
    loginPerfLog('dashboard: shell_ready');
    if (wallMs != null) {
      loginPerfLog('summary', { submit_to_shell_client_ms: wallMs });
    }
  }, []);
  return null;
}
