'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import {
  devLogAndClearInvoiceSaveClickTrace,
  devLogInvoiceSaveClickFromTraceNoClear,
} from '@/lib/dev/invoice-save-timing';

/**
 * When landing on the invoice page with `?saved=1` (e.g. after create/save redirect),
 * show a single "Invoice saved" success toast and remove the param so a refresh
 * does not re-show the toast.
 */
function InvoiceSavedQueryToastInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { showSuccessToast } = useToasts();
  const savedToastAlreadyShownRef = useRef(false);

  useEffect(() => {
    if (searchParams.get('saved') !== '1') {
      savedToastAlreadyShownRef.current = false;
      return;
    }
    devLogInvoiceSaveClickFromTraceNoClear('click → ?saved=1 + InvoiceSavedQueryToast effect');
    if (!savedToastAlreadyShownRef.current) {
      savedToastAlreadyShownRef.current = true;
      // After the route is committed, wait for the next frame(s) so the saved preview is painted first.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          showSuccessToast('Invoice saved');
          if (process.env.NODE_ENV === 'development') {
            devLogAndClearInvoiceSaveClickTrace('click → success toast (2× rAF)');
          }
        });
      });
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete('saved');
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, showSuccessToast]);

  return null;
}

export function InvoiceSavedQueryToast() {
  return (
    <Suspense fallback={null}>
      <InvoiceSavedQueryToastInner />
    </Suspense>
  );
}
