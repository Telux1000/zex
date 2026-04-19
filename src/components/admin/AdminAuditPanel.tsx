'use client';

import { useEffect, useState } from 'react';
import { adminAuditTargetDescription } from '@/lib/admin/admin-audit-target-display';

type AuditRow = {
  id: string;
  actor_user_id: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata?: unknown;
  created_at: string;
};

export function AdminAuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    fetch('/api/admin/audit-logs')
      .then((r) => r.json())
      .then((json) => setRows(json.logs ?? []));
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">Admin Audit Log</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="py-2">When</th>
              <th className="py-2">Actor</th>
              <th className="py-2">Action</th>
              <th className="py-2">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="py-2">
                  {r.actor_user_id} ({r.actor_role})
                </td>
                <td className="py-2">{r.action}</td>
                <td className="max-w-xs break-words py-2 text-zinc-600 dark:text-zinc-400">
                  {adminAuditTargetDescription(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
