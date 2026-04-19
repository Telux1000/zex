'use client';

import { useEffect, useState } from 'react';

type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  status: string;
  total: number;
  currency: string;
  due_date: string;
};

export function AdminInvoicesPanel() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    fetch('/api/admin/invoices')
      .then((r) => r.json())
      .then((json) => setRows(json.invoices ?? []));
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">Invoices (Read-only)</h2>
      <p className="mt-1 text-sm text-slate-500">Debugging and verification only. No direct invoice edits from admin panel.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="py-2">Invoice</th>
              <th className="py-2">Customer</th>
              <th className="py-2">Status</th>
              <th className="py-2">Total</th>
              <th className="py-2">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2">{inv.invoice_number}</td>
                <td className="py-2">{inv.customer_name}</td>
                <td className="py-2">{inv.status}</td>
                <td className="py-2">
                  {inv.total} {inv.currency}
                </td>
                <td className="py-2">{new Date(inv.due_date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
