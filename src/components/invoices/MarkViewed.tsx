'use client';

import { useEffect } from 'react';

export function MarkViewed({
  invoiceId,
  token,
  status,
}: {
  invoiceId?: string;
  token?: string;
  status: string;
}) {
  useEffect(() => {
    if (status !== 'sent') return;
    const target =
      token && token.trim()
        ? `/api/public/invoices/token/${encodeURIComponent(token)}/viewed`
        : `/api/public/invoices/${invoiceId}/viewed`;
    fetch(target, { method: 'POST' }).catch(
      () => {}
    );
  }, [invoiceId, token, status]);

  return null;
}
