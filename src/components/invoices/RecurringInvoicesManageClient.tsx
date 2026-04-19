'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDisplayDate } from '@/lib/utils/date';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { RecurringInvoiceModal } from '@/components/invoices/RecurringInvoiceModal';

export type RecurringRuleListItem = {
  id: string;
  source_invoice_id: string | null;
  frequency: string;
  start_date: string;
  next_run_date: string;
  end_condition_type: string;
  end_date: string | null;
  end_after_count: number | null;
  automation_mode: string;
  status: string;
  invoices_generated_count: number;
  customer_label: string;
};

type Props = {
  businessId: string;
  canMutate: boolean;
};

const freqLabel: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function RecurringInvoicesManageClient({ businessId, canMutate }: Props) {
  const { showSuccessToast, showErrorToast } = useToasts();
  const [rules, setRules] = useState<RecurringRuleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/recurring-invoices?business_id=${encodeURIComponent(businessId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load');
      setRules((data as { rules?: RecurringRuleListItem[] }).rules ?? []);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [businessId, showErrorToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRule = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/recurring-invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
    return data;
  };

  const handlePause = async (id: string) => {
    try {
      await patchRule(id, { status: 'paused' });
      showSuccessToast('Recurring invoice paused');
      void load();
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await patchRule(id, { status: 'active' });
      showSuccessToast('Recurring invoice resumed');
      void load();
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this recurring schedule? No more invoices will be generated.')) return;
    try {
      await patchRule(id, { status: 'cancelled' });
      showSuccessToast('Recurring invoice cancelled');
      void load();
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <div className="mt-8">
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-slate-600 dark:text-slate-400">No recurring invoices yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Open any invoice and choose <span className="font-medium">Create recurring invoice</span> from the menu.
          </p>
          <Link
            href="/dashboard/invoices"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Back to invoices
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Frequency</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Next run</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Automation</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{r.customer_label}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {freqLabel[r.frequency] ?? r.frequency}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {formatDisplayDate(r.next_run_date)}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-300">{r.status}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {r.automation_mode === 'auto_send' ? 'Auto-send' : 'Draft'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canMutate && r.status !== 'cancelled' ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        {r.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => void handlePause(r.id)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Pause
                          </button>
                        ) : null}
                        {r.status === 'paused' ? (
                          <button
                            type="button"
                            onClick={() => void handleResume(r.id)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Resume
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setEditId(r.id)}
                          className="rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200 dark:hover:bg-indigo-900/60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCancel(r.id)}
                          className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                    {r.source_invoice_id ? (
                      <Link
                        href={`/dashboard/invoices/${r.source_invoice_id}`}
                        className="ml-2 inline-block text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Template
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editId ? (
        <RecurringInvoiceModal
          open
          onClose={() => setEditId(null)}
          businessId={businessId}
          editRuleId={editId}
          onCreated={({ message, next_invoice_date }) => {
            showSuccessToast(`${message}. Next invoice: ${formatDisplayDate(next_invoice_date)}`);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
