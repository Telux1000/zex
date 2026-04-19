'use client';

import { useEffect, useState } from 'react';
import type { NotificationPreferenceSettings } from '@/types/notifications';

const rowClass =
  'flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60';

const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

const hintClass = 'text-xs text-slate-500 dark:text-slate-400';

const defaultPrefs: NotificationPreferenceSettings = {
  invoice_sent_emails: true,
  payment_received_alerts: true,
  payment_reminders: true,
  overdue_reminders: true,
  quote_emails: true,
  ai_insight_emails: true,
  internal_operational_alerts: true,
};

type Props = {
  onSuccess: () => void;
  onClearSuccess: () => void;
};

export function NotificationPreferencesForm({ onSuccess, onClearSuccess }: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferenceSettings>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/notifications/preferences', { method: 'GET' });
        const data = await res.json();
        if (!res.ok) return;
        if (!mounted) return;
        setPrefs({
          invoice_sent_emails: Boolean(data.invoice_sent_emails),
          payment_received_alerts: Boolean(data.payment_received_alerts),
          payment_reminders: Boolean(data.payment_reminders),
          overdue_reminders: Boolean(data.overdue_reminders),
          quote_emails: Boolean(data.quote_emails),
          ai_insight_emails: Boolean(data.ai_insight_emails),
          internal_operational_alerts: Boolean(data.internal_operational_alerts),
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onClearSuccess();
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading notification preferences…</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={save}
      className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Notification Preferences</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Control which notification emails are sent. In-app alerts remain enabled for important events.
      </p>

      <div className="mt-5 space-y-2">
        <div className={rowClass}>
          <div>
            <div className={labelClass}>Invoice sent emails</div>
            <div className={hintClass}>Send customer email when invoice is sent.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.invoice_sent_emails}
            onChange={(e) => setPrefs((s) => ({ ...s, invoice_sent_emails: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>

        <div className={rowClass}>
          <div>
            <div className={labelClass}>Payment received alerts</div>
            <div className={hintClass}>Email updates for successful payment events.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.payment_received_alerts}
            onChange={(e) => setPrefs((s) => ({ ...s, payment_received_alerts: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>

        <div className={rowClass}>
          <div>
            <div className={labelClass}>Payment reminders</div>
            <div className={hintClass}>Upcoming due date reminder emails.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.payment_reminders}
            onChange={(e) => setPrefs((s) => ({ ...s, payment_reminders: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>

        <div className={rowClass}>
          <div>
            <div className={labelClass}>Overdue reminders</div>
            <div className={hintClass}>Reminder emails for overdue invoices.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.overdue_reminders}
            onChange={(e) => setPrefs((s) => ({ ...s, overdue_reminders: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>

        <div className={rowClass}>
          <div>
            <div className={labelClass}>Quote emails</div>
            <div className={hintClass}>Customer quote send emails.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.quote_emails}
            onChange={(e) => setPrefs((s) => ({ ...s, quote_emails: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>

        <div className={rowClass}>
          <div>
            <div className={labelClass}>AI insight emails</div>
            <div className={hintClass}>Email alerts for AI cash-flow warnings.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.ai_insight_emails}
            onChange={(e) => setPrefs((s) => ({ ...s, ai_insight_emails: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>

        <div className={rowClass}>
          <div>
            <div className={labelClass}>Internal operational alerts</div>
            <div className={hintClass}>Quote decisions, conversion events, and high expense alerts.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.internal_operational_alerts}
            onChange={(e) => setPrefs((s) => ({ ...s, internal_operational_alerts: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button type="submit" disabled={saving} className="app-btn-primary">
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </form>
  );
}

