'use client';

import { useState } from 'react';
import type { SecurityPoliciesDTO } from '@/components/admin/security/types';

export function AdminSecurityPoliciesSection({
  initial,
  canEdit,
  onSaved,
}: {
  initial: SecurityPoliciesDTO;
  canEdit: boolean;
  onSaved: (p: SecurityPoliciesDTO) => void;
}) {
  const [requireMfa, setRequireMfa] = useState(initial.require_mfa_for_internal_staff);
  const [inviteTtl, setInviteTtl] = useState(String(initial.invite_ttl_hours));
  const [sessionTimeout, setSessionTimeout] = useState(
    initial.session_timeout_minutes === null ? '' : String(initial.session_timeout_minutes)
  );
  const [resetPolicy, setResetPolicy] = useState<'standard' | 'strict'>(initial.password_reset_policy);
  const [domainsText, setDomainsText] = useState(initial.staff_invite_allowed_domains.join('\n'));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const ttl = Number.parseInt(inviteTtl, 10);
    const st =
      sessionTimeout.trim() === '' ? null : Number.parseInt(sessionTimeout, 10);
    const domains = domainsText
      .split(/[\n,]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    try {
      const res = await fetch('/api/admin/security/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          require_mfa_for_internal_staff: requireMfa,
          invite_ttl_hours: Number.isFinite(ttl) ? ttl : undefined,
          session_timeout_minutes: st === null ? null : Number.isFinite(st) ? st : undefined,
          password_reset_policy: resetPolicy,
          staff_invite_allowed_domains: domains,
        }),
      });
      const json = (await res.json()) as { error?: unknown; policies?: SecurityPoliciesDTO };
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : 'Could not save policies.');
        return;
      }
      if (json.policies) {
        onSaved(json.policies);
        setRequireMfa(json.policies.require_mfa_for_internal_staff);
        setInviteTtl(String(json.policies.invite_ttl_hours));
        setSessionTimeout(
          json.policies.session_timeout_minutes === null ? '' : String(json.policies.session_timeout_minutes)
        );
        setResetPolicy(json.policies.password_reset_policy);
        setDomainsText(json.policies.staff_invite_allowed_domains.join('\n'));
      }
      setMessage('Policies saved. Changes are written to the audit log.');
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Policies</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Owner-level controls for how internal staff authenticate and how invitations behave. Session lifetime for JWTs
          is still ultimately governed in the Supabase project — the field below is for operational documentation and
          future enforcement hooks.
        </p>
      </div>

      {!canEdit ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          You can view policies, but only <span className="font-semibold">owners</span> can edit them.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900"
              checked={requireMfa}
              disabled={!canEdit}
              onChange={(e) => setRequireMfa(e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Require MFA for internal staff
              </span>
              <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-500">
                When enabled, users without a verified MFA factor cannot access admin APIs or pages until they enroll
                under Settings → Security in the tenant app.
              </span>
            </span>
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Invite link TTL (hours)
            </label>
            <input
              type="number"
              min={1}
              max={168}
              value={inviteTtl}
              disabled={!canEdit}
              onChange={(e) => setInviteTtl(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p className="mt-2 text-xs text-zinc-500">Applied to new invites and resends.</p>
          </div>

          <div className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Documented session timeout (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={10080}
              placeholder="e.g. 480"
              value={sessionTimeout}
              disabled={!canEdit}
              onChange={(e) => setSessionTimeout(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Informational unless wired to shorter-lived sessions. Align with Supabase JWT expiry in dashboard.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Password reset handling</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="prp"
                checked={resetPolicy === 'standard'}
                disabled={!canEdit}
                onChange={() => setResetPolicy('standard')}
              />
              Standard (default)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="prp"
                checked={resetPolicy === 'strict'}
                disabled={!canEdit}
                onChange={() => setResetPolicy('strict')}
              />
              Strict (documented expectation for ops review)
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Affects operational guidance only today; all resets remain audited under{' '}
            <span className="font-mono text-[11px]">admin_subscriber_password_reset_sent</span>.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Allowed email domains for staff invites
          </label>
          <textarea
            value={domainsText}
            disabled={!canEdit}
            onChange={(e) => setDomainsText(e.target.value)}
            rows={4}
            placeholder={'One domain per line, e.g.\nzenzex.com\ncontractor.io\n(leave empty to allow any domain)'}
            className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>

        {message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        {canEdit ? (
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {saving ? 'Saving…' : 'Save policies'}
          </button>
        ) : null}

        {initial.updated_at ? (
          <p className="text-xs text-zinc-500">
            Last updated {new Date(initial.updated_at).toLocaleString()}
            {initial.updated_by_user_id ? ` · actor ${initial.updated_by_user_id.slice(0, 8)}…` : null}
          </p>
        ) : null}
      </form>
    </div>
  );
}
