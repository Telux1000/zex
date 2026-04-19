'use client';

import { useState } from 'react';
import { useToasts } from '@/components/feedback/toast/ToastProvider';

export function PublicInvoicePayButton({
  invoiceId,
  token,
}: {
  invoiceId?: string;
  token?: string;
}) {
  const [loading, setLoading] = useState(false);
  const { showErrorToast, showSuccessToast } = useToasts();

  async function handleClick() {
    setLoading(true);
    try {
      const target =
        token && token.trim()
          ? `/api/public/invoices/token/${encodeURIComponent(token)}/checkout`
          : `/api/public/invoices/${invoiceId}/checkout`;
      const res = await fetch(target, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      if (data.url) {
        showSuccessToast('Invoice sent');
        window.location.href = data.url;
      }
      else throw new Error('No payment URL');
    } catch (e) {
      showErrorToast("Couldn\u2019t send invoice. Try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="app-btn-primary disabled:opacity-50"
    >
      {loading ? 'Opening payment...' : 'Pay now'}
    </button>
  );
}
