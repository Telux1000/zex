'use client';

import { useEffect, useState } from 'react';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { resolveSubscriberWorkspaceRole } from '@/lib/roles/workspace-roles';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const readOnlyClass =
  'mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300';

const FULL_NAME_REQUIRED = 'Full name is required';

/** Server-provided row for Settings — skips client `/api/profile` round-trip on first paint. */
export type SettingsProfileCardInitial = {
  full_name: string | null;
  email: string | null;
  workspace_role: string | null;
};

type Props = {
  /** When set (e.g. from RSC), the profile card renders immediately without waiting on `/api/profile`. */
  profileCardInitial?: SettingsProfileCardInitial | null;
  onSuccess: () => void;
  onClearSuccess: () => void;
  /** When set, external buttons can submit via <button type="submit" form={formId} /> */
  formId?: string;
  /** Hide built-in title/description (e.g. onboarding supplies its own). */
  variant?: 'settings' | 'onboarding';
  /** Show the default Save button (off when using external Continue). */
  showBuiltInSubmit?: boolean;
  onSaveError?: (message: string) => void;
  /** Scroll to and focus full name (e.g. from Settings ?focus=full_name). */
  focusFullNameOnMount?: boolean;
  /** Called only after client validation passes, immediately before loading/saving state (e.g. set parent “Saving…”). */
  onValidatedSubmitStart?: () => void;
  /** Whether the trimmed full name is non-empty; for disabling external Continue until valid. */
  onCanSubmitChange?: (canSubmit: boolean) => void;
};

const cardClass =
  'rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900';

export function AccountSettingsForm({
  profileCardInitial = null,
  onSuccess,
  onClearSuccess,
  formId,
  variant = 'settings',
  showBuiltInSubmit = true,
  onSaveError,
  focusFullNameOnMount = false,
  onValidatedSubmitStart,
  onCanSubmitChange,
}: Props) {
  const [fullName, setFullName] = useState(() => profileCardInitial?.full_name ?? '');
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState<string | null>(() => profileCardInitial?.email ?? null);
  const [role, setRole] = useState<string | null>(() => profileCardInitial?.workspace_role ?? null);
  const [loading, setLoading] = useState(() => !profileCardInitial);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (profileCardInitial) return;
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load profile');
        if (cancelled) return;
        const p = data.profile as { full_name?: string | null; role?: string | null } | undefined;
        const payload = data as {
          workspace_role?: string | null;
          business_role?: string | null;
        };
        setFullName(p?.full_name ?? '');
        setLoginEmail((data.user?.email as string | null) ?? null);
        setRole(
          payload.workspace_role ??
            resolveSubscriberWorkspaceRole(payload.business_role ?? null, p?.role ?? null)
        );
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileCardInitial]);

  useEffect(() => {
    if (!focusFullNameOnMount || loading) return;
    const el = document.getElementById('profile-full-name') as HTMLInputElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-white', 'dark:ring-offset-slate-900');
    });
    const t = window.setTimeout(() => {
      el.classList.remove(
        'ring-2',
        'ring-amber-400',
        'ring-offset-2',
        'ring-offset-white',
        'dark:ring-offset-slate-900'
      );
    }, 2800);
    return () => window.clearTimeout(t);
  }, [focusFullNameOnMount, loading]);

  useEffect(() => {
    if (loading) return;
    onCanSubmitChange?.(Boolean(fullName.trim()));
  }, [loading, fullName, onCanSubmitChange]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      setFullNameError(FULL_NAME_REQUIRED);
      return;
    }
    setFullNameError(null);
    onValidatedSubmitStart?.();
    setSaving(true);
    onClearSuccess();
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      onSuccess();
    } catch (err) {
      onSaveError?.(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading profile…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-slate-900">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      </div>
    );
  }

  const onboarding = variant === 'onboarding';

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      <form id={formId} onSubmit={handleSubmit} className={cardClass}>
        {focusFullNameOnMount && !fullName.trim() ? (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            Add your name so teammates recognize you. This is the same field as in onboarding — you can update
            it anytime here.
          </div>
        ) : null}
        {!onboarding ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Profile</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage your personal information
            </p>
          </>
        ) : (
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Same fields as{' '}
            <a href="/settings?section=profile" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Settings → Profile
            </a>
            .
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="profile-full-name">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="profile-full-name"
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                const v = e.target.value;
                if (fullNameError && v.trim()) setFullNameError(null);
              }}
              onBlur={() => {
                if (!fullName.trim()) setFullNameError(FULL_NAME_REQUIRED);
              }}
              autoComplete="name"
              aria-invalid={Boolean(fullNameError)}
              aria-describedby={fullNameError ? 'profile-full-name-err' : undefined}
              className={`${inputClass} ${fullNameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500' : ''}`}
            />
            {fullNameError ? (
              <p id="profile-full-name-err" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fullNameError}
              </p>
            ) : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="profile-email">
              Email address
            </label>
            <input
              id="profile-email"
              type="email"
              value={loginEmail ?? ''}
              readOnly
              className={readOnlyClass}
              aria-readonly="true"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Used to sign in. To change it, use your email provider or recovery from the login screen when
              supported.
            </p>
          </div>
          <div>
            <span className={labelClass}>Role</span>
            <div className={`${readOnlyClass} mt-1`}>
              <RoleBadge role={role} />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Defines permissions for this workspace. Contact support to change roles for additional users.
            </p>
          </div>
        </div>

        {showBuiltInSubmit ? (
          <div className="mt-6">
            <button
              type="submit"
              disabled={saving || !fullName.trim()}
              className="app-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
