'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdminSupportUnread } from '@/contexts/AdminSupportUnreadContext';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { cn } from '@/lib/utils/cn';
import type { AdminPlatformSettingsDTO } from '@/lib/admin/admin-platform-settings';
import type { SignupSettings } from '@/lib/auth/signup-control';
import type { InternalSecuritySettingsDTO } from '@/lib/admin/internal-security-settings';

type TabId = 'platform' | 'signup' | 'notifications' | 'authentication' | 'billing' | 'ai' | 'environment';

type SettingsPayload = {
  platform: AdminPlatformSettingsDTO;
  signup: SignupSettings;
  security: InternalSecuritySettingsDTO;
  environment: {
    node_env: string;
    postmark_configured: boolean;
    paddle_billing_api_configured: boolean;
    paddle_billing_webhook_configured: boolean;
    app_url_configured: boolean;
  };
  can_edit: boolean;
  can_edit_signup: boolean;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'platform', label: 'Platform' },
  { id: 'signup', label: 'Signup' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'authentication', label: 'Authentication & access' },
  { id: 'billing', label: 'Billing' },
  { id: 'ai', label: 'AI & automation' },
  { id: 'environment', label: 'Environment' },
];

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-zinc-100 py-4 last:border-0 dark:border-zinc-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:max-w-md">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
        <div className="shrink-0 sm:pt-0.5">{children}</div>
      </div>
    </div>
  );
}

export function AdminSettingsPanel() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('platform');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(typeof json.error === 'string' ? json.error : 'Failed to load settings');
          setData(null);
          return;
        }
        setError(null);
        setData(json as SettingsPayload);
      })
      .catch(() => {
        setError('Failed to load settings');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSection = async (section: string, body: Record<string, unknown>) => {
    if (!data?.can_edit) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, ...body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveMsg(typeof json.error === 'string' ? json.error : 'Save failed');
        return;
      }
      setSaveMsg('Saved.');
      load();
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminContentCard>
        <p className="text-sm text-zinc-500">Loading settings…</p>
      </AdminContentCard>
    );
  }

  if (error || !data) {
    return (
      <AdminContentCard>
        <p className="text-sm text-red-600 dark:text-red-400">{error ?? 'Unknown error'}</p>
      </AdminContentCard>
    );
  }

  const { platform, signup, security, environment, can_edit: canEdit, can_edit_signup: canEditSignup } = data;
  const readOnly = !canEdit;

  return (
    <div className="space-y-4">
      <AdminContentCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Settings</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Platform behavior, delivery, billing defaults, and automation. Only owners can change policies.
            </p>
          </div>
          {readOnly && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">View only — owner role required to edit.</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-700">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setSaveMsg(null);
              }}
              className={cn(
                'rounded-t-md px-3 py-2 text-xs font-medium transition-colors',
                tab === t.id
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {saveMsg && (
          <p
            className={cn(
              'mt-3 text-xs',
              saveMsg === 'Saved.' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {saveMsg}
          </p>
        )}

        {tab === 'platform' && (
          <PlatformTab
            platform={platform}
            disabled={readOnly || saving}
            onSave={(patch) => void saveSection('platform', patch)}
          />
        )}
        {tab === 'signup' && (
          <SignupTab
            signup={signup}
            disabled={!canEditSignup || saving}
            onSave={(patch) => void saveSection('signup', patch)}
          />
        )}
        {tab === 'notifications' && (
          <NotificationsTab
            platform={platform}
            disabled={readOnly || saving}
            onSave={(patch) => void saveSection('notifications', patch)}
          />
        )}
        {tab === 'authentication' && (
          <AuthenticationTab
            security={security}
            disabled={readOnly || saving}
            onSave={(patch) => void saveSection('authentication', patch)}
          />
        )}
        {tab === 'billing' && (
          <BillingTab
            platform={platform}
            disabled={readOnly || saving}
            onSave={(patch) => void saveSection('billing', patch)}
          />
        )}
        {tab === 'ai' && (
          <AiTab
            platform={platform}
            disabled={readOnly || saving}
            onSave={(patch) => void saveSection('ai', patch)}
          />
        )}
        {tab === 'environment' && <EnvironmentTab environment={environment} />}
      </AdminContentCard>

      <AdminContentCard>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Related</h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Profile and B-code:{' '}
          <Link href="/admin/profile" className="font-medium text-zinc-900 underline dark:text-zinc-100">
            Profile
          </Link>
          . Security activity:{' '}
          <Link href="/admin/security" className="font-medium text-zinc-900 underline dark:text-zinc-100">
            Security
          </Link>
          . Team:{' '}
          <Link href="/admin/team" className="font-medium text-zinc-900 underline dark:text-zinc-100">
            Team
          </Link>
          .
        </p>
      </AdminContentCard>
    </div>
  );
}

function SignupTab({
  signup,
  disabled,
  onSave,
}: {
  signup: SignupSettings;
  disabled: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState(signup.signup_mode);
  const [message, setMessage] = useState(signup.signup_message ?? '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteHours, setInviteHours] = useState(168);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    setMode(signup.signup_mode);
    setMessage(signup.signup_message ?? '');
  }, [signup]);

  async function createInvite() {
    setInviteBusy(true);
    setInviteMsg(null);
    setInviteUrl(null);
    try {
      const res = await fetch('/api/admin/signup-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim() || null,
          expires_in_hours: inviteHours,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteMsg(typeof json.error === 'string' ? json.error : 'Could not create invite.');
        return;
      }
      const link = String(json?.invite?.invite_url ?? '').trim();
      if (link) setInviteUrl(link);
      setInviteMsg('Invite generated.');
    } catch {
      setInviteMsg('Could not create invite.');
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <Field
        label="Signup mode"
        description="OPEN allows anyone, CLOSED blocks public registration, INVITE_ONLY requires a valid invite token."
      >
        <select
          className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={mode}
          disabled={disabled}
          onChange={(e) => setMode(e.target.value as SignupSettings['signup_mode'])}
        >
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="INVITE_ONLY">Invite only</option>
        </select>
      </Field>
      <Field
        label="Signup message"
        description="Optional message displayed to users when signup is blocked or invite-only."
      >
        <textarea
          className="min-h-[86px] w-full max-w-lg rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={message}
          maxLength={2000}
          disabled={disabled}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Signups are temporarily paused while we perform maintenance."
        />
      </Field>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSave({
              signup_mode: mode,
              signup_message: message.trim() || null,
            })
          }
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save signup settings
        </button>
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Generate signup invite</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Use this link when signup mode is set to invite only.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            type="email"
            className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            placeholder="Optional recipient email"
            value={inviteEmail}
            disabled={disabled || inviteBusy}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <input
            type="number"
            min={1}
            max={720}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={inviteHours}
            disabled={disabled || inviteBusy}
            onChange={(e) => setInviteHours(Math.min(720, Math.max(1, Number(e.target.value) || 168)))}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={disabled || inviteBusy}
            onClick={() => void createInvite()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {inviteBusy ? 'Generating…' : 'Generate invite link'}
          </button>
        </div>
        {inviteMsg && (
          <p
            className={cn(
              'mt-3 text-xs',
              inviteMsg === 'Invite generated.' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {inviteMsg}
          </p>
        )}
        {inviteUrl && (
          <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <p className="font-medium">Invite URL</p>
            <p className="mt-1 break-all">{inviteUrl}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlatformTab({
  platform,
  disabled,
  onSave,
}: {
  platform: AdminPlatformSettingsDTO;
  disabled: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(platform);
  useEffect(() => {
    setDraft(platform);
  }, [platform]);

  return (
    <div className="mt-2">
      <Field
        label="AI assistant"
        description="Global switch for the subscriber AI assistant and related flows. Plan checks still apply when enabled."
      >
        <Toggle
          checked={draft.feature_ai_assistant_enabled}
          disabled={disabled}
          onChange={(v) => setDraft((d) => ({ ...d, feature_ai_assistant_enabled: v }))}
        />
      </Field>
      <Field
        label="Invoice payment reminders"
        description="Cron-driven reminder emails for open invoices. When off, no automated reminders are sent."
      >
        <Toggle
          checked={draft.feature_reminders_enabled}
          disabled={disabled}
          onChange={(v) => setDraft((d) => ({ ...d, feature_reminders_enabled: v }))}
        />
      </Field>
      <Field
        label="Scheduled invoice send"
        description="Cron that sends draft invoices when their scheduled time is due. When off, scheduled sends do not run."
      >
        <Toggle
          checked={draft.feature_scheduled_send_enabled}
          disabled={disabled}
          onChange={(v) => setDraft((d) => ({ ...d, feature_scheduled_send_enabled: v }))}
        />
      </Field>
      <Field
        label="Default plan for new accounts"
        description="Billing plan stored on new subscriber profiles at signup (Paddle catalog price IDs come from environment / admin defaults)."
      >
        <select
          className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={draft.default_new_account_plan}
          disabled={disabled}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              default_new_account_plan: e.target.value as AdminPlatformSettingsDTO['default_new_account_plan'],
            }))
          }
        >
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </Field>
      <Field
        label="Starter — max invoices per month"
        description="Hard cap for Starter plan workspaces (calendar month, UTC)."
      >
        <input
          type="number"
          min={1}
          max={100000}
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={draft.starter_monthly_invoice_limit}
          disabled={disabled}
          onChange={(e) =>
            setDraft((d) => ({ ...d, starter_monthly_invoice_limit: Number(e.target.value) || 1 }))
          }
        />
      </Field>
      <Field
        label="Growth — monthly invoice cap"
        description="Leave empty for no cap beyond plan features."
      >
        <input
          type="number"
          min={1}
          max={100000}
          placeholder="No cap"
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={draft.growth_monthly_invoice_limit ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({
              ...d,
              growth_monthly_invoice_limit: v === '' ? null : Number(v) || null,
            }));
          }}
        />
      </Field>
      <Field
        label="Professional — monthly invoice cap"
        description="Leave empty for no cap."
      >
        <input
          type="number"
          min={1}
          max={100000}
          placeholder="No cap"
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={draft.professional_monthly_invoice_limit ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({
              ...d,
              professional_monthly_invoice_limit: v === '' ? null : Number(v) || null,
            }));
          }}
        />
      </Field>
      <Field
        label="Enterprise — monthly invoice cap"
        description="Leave empty for no cap."
      >
        <input
          type="number"
          min={1}
          max={100000}
          placeholder="No cap"
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={draft.enterprise_monthly_invoice_limit ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({
              ...d,
              enterprise_monthly_invoice_limit: v === '' ? null : Number(v) || null,
            }));
          }}
        />
      </Field>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSave({
              feature_ai_assistant_enabled: draft.feature_ai_assistant_enabled,
              feature_reminders_enabled: draft.feature_reminders_enabled,
              feature_scheduled_send_enabled: draft.feature_scheduled_send_enabled,
              default_new_account_plan: draft.default_new_account_plan,
              starter_monthly_invoice_limit: draft.starter_monthly_invoice_limit,
              growth_monthly_invoice_limit: draft.growth_monthly_invoice_limit,
              professional_monthly_invoice_limit: draft.professional_monthly_invoice_limit,
              enterprise_monthly_invoice_limit: draft.enterprise_monthly_invoice_limit,
            })
          }
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save platform
        </button>
      </div>
    </div>
  );
}

function AdminSupportTicketSoundField() {
  const router = useRouter();
  const ctx = useAdminSupportUnread();
  const [busy, setBusy] = useState(false);
  if (!ctx) return null;
  return (
    <Field
      label="Play ticket notification sound"
      description="When a subscriber sends a new support message, play a short chime if you are not viewing that ticket. Your preference is saved to your staff profile."
    >
      <Toggle
        checked={ctx.soundEnabled}
        disabled={busy}
        onChange={async (v) => {
          setBusy(true);
          try {
            await ctx.setSoundEnabled(v);
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      />
    </Field>
  );
}

function NotificationsTab({
  platform,
  disabled,
  onSave,
}: {
  platform: AdminPlatformSettingsDTO;
  disabled: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [adminEmail, setAdminEmail] = useState(platform.admin_alerts_email ?? '');
  const [senderLabel, setSenderLabel] = useState(platform.system_sender_label ?? '');
  useEffect(() => {
    setAdminEmail(platform.admin_alerts_email ?? '');
    setSenderLabel(platform.system_sender_label ?? '');
  }, [platform]);

  return (
    <div className="mt-2">
      <AdminSupportTicketSoundField />
      <Field
        label="Admin alerts email"
        description="BCC destination for internal staff invitation emails so operations sees outbound invites. Uses Postmark when configured."
      >
        <input
          type="email"
          className="w-64 max-w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={adminEmail}
          disabled={disabled}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="ops@company.com"
        />
      </Field>
      <Field
        label="System sender display name"
        description="Optional display name prepended to POSTMARK_FROM_EMAIL when it is a bare address (invitation emails)."
      >
        <input
          type="text"
          maxLength={120}
          className="w-64 max-w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={senderLabel}
          disabled={disabled}
          onChange={(e) => setSenderLabel(e.target.value)}
          placeholder="Zenzex Billing"
        />
      </Field>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSave({
              admin_alerts_email: adminEmail.trim() || null,
              system_sender_label: senderLabel.trim() || null,
            })
          }
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save notifications
        </button>
      </div>
    </div>
  );
}

function AuthenticationTab({
  security,
  disabled,
  onSave,
}: {
  security: InternalSecuritySettingsDTO;
  disabled: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [mfa, setMfa] = useState(security.require_mfa_for_internal_staff);
  const [ttl, setTtl] = useState(security.invite_ttl_hours);
  const [sessionMin, setSessionMin] = useState(security.session_timeout_minutes ?? '');
  const [pwdPolicy, setPwdPolicy] = useState(security.password_reset_policy);
  const [domains, setDomains] = useState(security.staff_invite_allowed_domains.join(', '));
  useEffect(() => {
    setMfa(security.require_mfa_for_internal_staff);
    setTtl(security.invite_ttl_hours);
    setSessionMin(security.session_timeout_minutes ?? '');
    setPwdPolicy(security.password_reset_policy);
    setDomains(security.staff_invite_allowed_domains.join(', '));
  }, [security]);

  return (
    <div className="mt-2">
      <Field
        label="Require MFA for internal staff"
        description="When enabled, internal admin console access requires verified MFA on the subscriber security settings."
      >
        <Toggle checked={mfa} disabled={disabled} onChange={setMfa} />
      </Field>
      <Field
        label="Invite link lifetime"
        description="Hours until internal staff invitations expire (1–168)."
      >
        <input
          type="number"
          min={1}
          max={168}
          className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={ttl}
          disabled={disabled}
          onChange={(e) => setTtl(Math.min(168, Math.max(1, Number(e.target.value) || 72)))}
        />
      </Field>
      <Field
        label="Session timeout (minutes)"
        description="Optional idle timeout hint for console sessions; empty leaves policy unset."
      >
        <input
          type="number"
          min={5}
          max={10080}
          placeholder="Not set"
          className="w-32 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={sessionMin === null || sessionMin === '' ? '' : sessionMin}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setSessionMin(v === '' ? '' : Number(v));
          }}
        />
      </Field>
      <Field
        label="Password reset policy"
        description="Strict may require additional verification steps in future flows; currently recorded for policy alignment."
      >
        <select
          className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={pwdPolicy}
          disabled={disabled}
          onChange={(e) => setPwdPolicy(e.target.value as InternalSecuritySettingsDTO['password_reset_policy'])}
        >
          <option value="standard">Standard</option>
          <option value="strict">Strict</option>
        </select>
      </Field>
      <Field
        label="Staff invite email domains"
        description="Comma-separated allowlist; empty allows any domain."
      >
        <textarea
          className="min-h-[72px] w-full max-w-lg rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={domains}
          disabled={disabled}
          onChange={(e) => setDomains(e.target.value)}
          placeholder="example.com, company.org"
        />
      </Field>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const domainList = domains
              .split(/[,\n]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            onSave({
              require_mfa_for_internal_staff: mfa,
              invite_ttl_hours: ttl,
              session_timeout_minutes: sessionMin === '' ? null : Number(sessionMin),
              password_reset_policy: pwdPolicy,
              staff_invite_allowed_domains: domainList,
            });
          }}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save authentication
        </button>
      </div>
    </div>
  );
}

function BillingTab({
  platform,
  disabled,
  onSave,
}: {
  platform: AdminPlatformSettingsDTO;
  disabled: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [trialDays, setTrialDays] = useState(platform.trial_days);
  const [pStarter, setPStarter] = useState(platform.plan_price_starter_cents ?? '');
  const [pGrowth, setPGrowth] = useState(platform.plan_price_growth_cents ?? '');
  const [pProf, setPProf] = useState(platform.plan_price_professional_cents ?? '');
  const [pEnt, setPEnt] = useState(platform.plan_price_enterprise_cents ?? '');
  useEffect(() => {
    setTrialDays(platform.trial_days);
    setPStarter(platform.plan_price_starter_cents ?? '');
    setPGrowth(platform.plan_price_growth_cents ?? '');
    setPProf(platform.plan_price_professional_cents ?? '');
    setPEnt(platform.plan_price_enterprise_cents ?? '');
  }, [platform]);

  const centsOrNull = (v: string | number) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="mt-2">
      <Field
        label="Trial length (days)"
        description="Applied to new subscriber profiles and billing page copy. Does not retroactively change existing trials."
      >
        <input
          type="number"
          min={0}
          max={730}
          className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={trialDays}
          disabled={disabled}
          onChange={(e) => setTrialDays(Number(e.target.value))}
        />
      </Field>
      <p className="mt-4 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Display prices (cents / month){' '}
        <span className="font-normal text-zinc-500">— leave empty to use built-in defaults. Paddle checkout uses NEXT_PUBLIC_PADDLE_PRICE_* env vars.</span>
      </p>
      <Field label="Starter (cents)" description="Shown on subscriber billing page when set.">
        <input
          type="number"
          min={0}
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={pStarter}
          disabled={disabled}
          onChange={(e) => setPStarter(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="default"
        />
      </Field>
      <Field label="Growth (cents)" description="Monthly list price override for UI.">
        <input
          type="number"
          min={0}
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={pGrowth}
          disabled={disabled}
          onChange={(e) => setPGrowth(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="default"
        />
      </Field>
      <Field label="Professional (cents)" description="Monthly list price override for UI.">
        <input
          type="number"
          min={0}
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={pProf}
          disabled={disabled}
          onChange={(e) => setPProf(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="default"
        />
      </Field>
      <Field label="Enterprise (cents)" description="Monthly list price override for UI.">
        <input
          type="number"
          min={0}
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={pEnt}
          disabled={disabled}
          onChange={(e) => setPEnt(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="default"
        />
      </Field>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSave({
              trial_days: trialDays,
              plan_price_starter_cents: centsOrNull(pStarter),
              plan_price_growth_cents: centsOrNull(pGrowth),
              plan_price_professional_cents: centsOrNull(pProf),
              plan_price_enterprise_cents: centsOrNull(pEnt),
            })
          }
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save billing
        </button>
      </div>
    </div>
  );
}

function AiTab({
  platform,
  disabled,
  onSave,
}: {
  platform: AdminPlatformSettingsDTO;
  disabled: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [daily, setDaily] = useState(platform.ai_assistant_daily_requests_per_user);
  const [firstBefore, setFirstBefore] = useState(platform.reminder_default_first_before_due_days ?? '');
  const [leadMin, setLeadMin] = useState(platform.scheduling_min_lead_minutes);
  useEffect(() => {
    setDaily(platform.ai_assistant_daily_requests_per_user);
    setFirstBefore(platform.reminder_default_first_before_due_days ?? '');
    setLeadMin(platform.scheduling_min_lead_minutes);
  }, [platform]);

  return (
    <div className="mt-2">
      <Field
        label="AI assistant daily requests per user"
        description="Counted per subscriber user per UTC day on the main Business Assistant API."
      >
        <input
          type="number"
          min={1}
          max={100000}
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={daily}
          disabled={disabled}
          onChange={(e) => setDaily(Number(e.target.value) || 1)}
        />
      </Field>
      <Field
        label="Default first reminder (days before due)"
        description="Fallback timing when customer and invoice use defaults. Second reminder stays the built-in after-due step."
      >
        <input
          type="number"
          min={0}
          max={90}
          placeholder="Built-in (3)"
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={firstBefore === null || firstBefore === '' ? '' : firstBefore}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setFirstBefore(v === '' ? '' : Number(v));
          }}
        />
      </Field>
      <Field
        label="Minimum lead time for scheduled send"
        description="Invoices cannot be scheduled to send sooner than this many minutes from save time."
      >
        <input
          type="number"
          min={1}
          max={10080}
          className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={leadMin}
          disabled={disabled}
          onChange={(e) => setLeadMin(Number(e.target.value) || 1)}
        />
      </Field>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSave({
              ai_assistant_daily_requests_per_user: daily,
              reminder_default_first_before_due_days: firstBefore === '' ? null : Number(firstBefore),
              scheduling_min_lead_minutes: leadMin,
            })
          }
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save AI & automation
        </button>
      </div>
    </div>
  );
}

function EnvironmentTab({
  environment,
}: {
  environment: SettingsPayload['environment'];
}) {
  return (
    <div className="mt-2 space-y-2 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Node</span>: {environment.node_env}
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Postmark</span>:{' '}
        {environment.postmark_configured ? 'Server token present' : 'Not configured'}
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Paddle Billing API key</span>:{' '}
        {environment.paddle_billing_api_configured ? 'Set' : 'Missing'}
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Paddle Billing webhook secret</span>:{' '}
        {environment.paddle_billing_webhook_configured ? 'Set' : 'Missing'}
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">App URL</span>:{' '}
        {environment.app_url_configured ? 'Set' : 'Missing'}
      </p>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700',
        disabled && 'cursor-not-allowed opacity-40'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}
