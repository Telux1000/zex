'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { pageSectionKeyFromPathname } from '@/lib/product-usage/section-from-pathname';

/**
 * Records coarse dashboard section views for admin Product Usage analytics.
 * Dedupes React Strict Mode double-invoke for the same path within a short window.
 */
export function ProductUsageBeacon({ businessId }: { businessId: string | null }) {
  const pathname = usePathname() ?? '';
  const lastRef = useRef<{ path: string; at: number } | null>(null);

  useEffect(() => {
    if (!businessId) return;
    const section = pageSectionKeyFromPathname(pathname);
    if (!section) return;

    const now = Date.now();
    const prev = lastRef.current;
    if (prev && prev.path === pathname && now - prev.at < 800) return;
    lastRef.current = { path: pathname, at: now };

    const ac = new AbortController();
    const t = window.setTimeout(() => {
      void fetch('/api/product-usage/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'page_view',
          target_key: section,
          business_id: businessId,
        }),
        signal: ac.signal,
      }).catch(() => {});
    }, 0);

    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [pathname, businessId]);

  return null;
}
