'use client';

import { useState } from 'react';
import { useToasts } from '@/components/feedback/toast/ToastProvider';

export function SendInvoiceButton({ invoiceId, onSent }: { invoiceId: string; onSent?: () => void }) {
  const [loading, setLoading] = useState(false);
  const { showSuccessToast, showErrorToast } = useToasts();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, mode: 'send_invoice' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      showSuccessToast('Invoice sent');
      onSent?.();
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
      className="app-btn-primary whitespace-nowrap"
    >
      {loading ? 'Sending invoice...' : 'Send Invoice'}
    </button>
  );
}
