'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { useAdminSupportUnread } from '@/contexts/AdminSupportUnreadContext';
import { cn } from '@/lib/utils/cn';

type ProfilePayload = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  internal_code: string | null;
  role: string | null;
  status: string;
  created_at: string | null;
  last_active_at: string | null;
  internal_support_ticket_sound?: boolean;
};

function formatRole(r: string | null): string {
  const x = String(r ?? '').toLowerCase();
  if (x === 'owner') return 'Owner';
  if (x === 'admin') return 'Admin';
  if (x === 'support') return 'Support';
  return r ?? '—';
}

function initials(name: string, email: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/** Full admin Profile page: editable display name; read-only B-code, email, role. */
export function AdminProfileView() {
  const router = useRouter();
  const supportUnread = useAdminSupportUnread();
  const { showSuccessToast, showErrorToast } = useToasts();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullNameDraft, setFullNameDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [soundBusy, setSoundBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/profile');
      const json = (await res.json()) as ProfilePayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Could not load profile.');
        return;
      }
      setData(json);
      setFullNameDraft(json.display_name?.trim() ?? '');
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savedTrimmed = (data?.display_name ?? '').trim();
  const draftTrimmed = fullNameDraft.trim();
  const dirty = draftTrimmed !== savedTrimmed;
  const canSave = dirty && draftTrimmed.length > 0 && !saving;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    const next = fullNameDraft.trim();
    if (!next) {
      setFieldError('Full name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: next }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        display_name?: string;
        unchanged?: boolean;
        error?: string;
      };
      if (!res.ok) {
        showErrorToast(json.error ?? 'Could not save.');
        return;
      }
      const displayName = json.display_name ?? next;
      setData((prev) => (prev ? { ...prev, display_name: displayName } : prev));
      setFullNameDraft(displayName);
      if (json.unchanged) {
        showSuccessToast('No changes to save.');
      } else {
        showSuccessToast('Name saved.');
      }
      router.refresh();
    } catch {
      showErrorToast('Network error.');
    } finally {
      setSaving(false);
    }
  }

  const ticketSoundOn = supportUnread?.soundEnabled ?? data?.internal_support_ticket_sound !== false;

  async function toggleTicketSound(next: boolean) {
    setSoundBusy(true);
    try {
      if (supportUnread) {
        await supportUnread.setSoundEnabled(next);
      } else {
        const res = await fetch('/api/admin/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ internal_support_ticket_sound: next }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          showErrorToast(json.error ?? 'Could not save.');
          return;
        }
        setData((prev) => (prev ? { ...prev, internal_support_ticket_sound: next } : prev));
      }
      showSuccessToast(next ? 'Ticket sounds on.' : 'Ticket sounds off.');
      router.refresh();
    } catch {
      showErrorToast('Network error.');
    } finally {
      setSoundBusy(false);
    }
  }

  if (loading) {
    return (
      <AdminContentCard>
        <p className="text-sm text-zinc-500">Loading your profile…</p>
      </AdminContentCard>
    );
  }

  if (error || !data) {
    return (
      <AdminContentCard className="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30">
        <p className="text-sm text-red-800 dark:text-red-300">{error ?? 'Unavailable'}</p>
      </AdminContentCard>
    );
  }

  const name = data.display_name ?? '';
  const email = data.email ?? '';
  const mono = initials(name, email);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-br from-white to-zinc-50 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900/80">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:gap-8">
          <div className="shrink-0">
            {data.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.avatar_url}
                alt=""
                className="h-20 w-20 rounded-2xl border border-zinc-200/80 object-cover shadow-sm dark:border-zinc-700"
              />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-200/80 bg-zinc-100 text-xl font-semibold tracking-tight text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                aria-hidden
              >
                {mono}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Internal admin
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {data.display_name?.trim() || '—'}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{email || '—'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {data.internal_code ? (
                <span className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-mono text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
                  {data.internal_code}
                </span>
              ) : null}
              <AdminBadge tone={data.status === 'suspended' ? 'suspended' : 'active'}>
                {data.status === 'suspended' ? 'Suspended' : 'Active'}
              </AdminBadge>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{formatRole(data.role)}</span>
            </div>
          </div>
        </div>
      </div>

      <AdminContentCard>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Full name</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Shown in the admin header, Team list, and new audit entries. Stored on your profile record.
        </p>
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div>
            <label htmlFor="admin-profile-full-name" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Display name <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id="admin-profile-full-name"
              type="text"
              autoComplete="name"
              value={fullNameDraft}
              onChange={(e) => {
                setFullNameDraft(e.target.value);
                setFieldError(null);
              }}
              className="mt-1.5 w-full max-w-md rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-500/30"
              required
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'admin-profile-name-error' : undefined}
            />
            {fieldError ? (
              <p id="admin-profile-name-error" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {fieldError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {saving ? 'Saving…' : 'Save name'}
            </button>
            {dirty ? (
              <button
                type="button"
                className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                onClick={() => {
                  setFullNameDraft(savedTrimmed);
                  setFieldError(null);
                }}
              >
                Reset
              </button>
            ) : null}
          </div>
        </form>
      </AdminContentCard>

      <AdminContentCard>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Support desk notifications</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Chime when a subscriber sends a new message and you are not viewing that ticket. Same setting as Admin → Settings → Notifications.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={ticketSoundOn}
            disabled={soundBusy}
            onClick={() => void toggleTicketSound(!ticketSoundOn)}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
              ticketSoundOn
                ? 'border-indigo-600 bg-indigo-600'
                : 'border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700',
              soundBusy && 'cursor-not-allowed opacity-40'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                ticketSoundOn ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {ticketSoundOn ? 'Sound on' : 'Sound off'}
          </span>
        </div>
      </AdminContentCard>

      <AdminContentCard>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Account details</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Work email, internal code, and role are managed by administrators — contact Team owners to change them.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Work email</dt>
            <dd className="mt-1">
              <input
                type="email"
                readOnly
                tabIndex={-1}
                value={data.email ?? ''}
                className="w-full max-w-md cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300"
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Internal code</dt>
            <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">{data.internal_code ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Role</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{formatRole(data.role)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</dt>
            <dd className="mt-0.5">
              {data.status === 'suspended' ? (
                <AdminBadge tone="suspended">Suspended</AdminBadge>
              ) : (
                <AdminBadge tone="active">Active</AdminBadge>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Last sign-in</dt>
            <dd className="mt-0.5 text-zinc-600 dark:text-zinc-400">
              {data.last_active_at ? new Date(data.last_active_at).toLocaleString() : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Profile since</dt>
            <dd className="mt-0.5 text-zinc-600 dark:text-zinc-400">
              {data.created_at ? new Date(data.created_at).toLocaleDateString() : '—'}
            </dd>
          </div>
        </dl>
      </AdminContentCard>
    </div>
  );
}
