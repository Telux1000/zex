'use client';

import { useEffect } from 'react';
import { ensurePaddleReady } from '@/lib/paddle/paddle-browser';

/**
 * Preloads and initializes Paddle.js once on the client. Mount near the app root
 * (e.g. inside `AppProviders`) so checkout is ready on marketing/pricing routes.
 */
export function PaddleProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensurePaddleReady().catch(() => {
      // Errors are already logged in ensurePaddleReady; avoid unhandled rejection.
    });
  }, []);

  return children;
}
