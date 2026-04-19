'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createPasswordResetBrowserClient } from '@/lib/supabase/client';
import { clearAssistantLocalDeviceCache } from '@/lib/assistant/conversation-storage';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

function ResetPasswordPageContent() {
  const supabase = useMemo(() => createPasswordResetBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      setMessage(null);
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
        const hp = new URLSearchParams(hash);
        const qp = new URLSearchParams(searchParams.toString());

        const errorDescription = hp.get('error_description') ?? qp.get('error_description');
        const errorCode = hp.get('error') ?? qp.get('error');
        if (errorDescription || errorCode) {
          if (!cancelled) {
            setReady(false);
            const raw = (errorDescription ?? errorCode ?? '').replace(/\+/g, ' ');
            setMessage({
              type: 'error',
              text: raw
                ? decodeURIComponent(raw)
                : 'This link is invalid. Request a new password reset.',
            });
          }
          return;
        }

        const typeFromUrl = hp.get('type') ?? qp.get('type');

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          if (!cancelled) {
            setReady(false);
            setMessage({
              type: 'error',
              text: 'This link is invalid or has expired. Request a new password reset.',
            });
          }
          return;
        }

        if (!session) {
          if (!cancelled) {
            setReady(false);
            setMessage({
              type: 'error',
              text: 'This link has expired or could not be opened in this browser. Request a new password reset.',
            });
          }
          return;
        }

        if (typeFromUrl && typeFromUrl !== 'recovery') {
          if (!cancelled) {
            setReady(false);
            setMessage({
              type: 'error',
              text: 'This link is not a password reset link. Use the link from your latest reset email.',
            });
          }
          return;
        }

        if (!cancelled) {
          setReady(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setMessage(null);
    if (!newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Both password fields are required.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setMessage({ type: 'error', text: error.message || 'Failed to reset password.' });
        return;
      }
      setMessage({ type: 'success', text: 'Password updated. Redirecting to sign in...' });
      clearAssistantLocalDeviceCache();
      await supabase.auth.signOut({ scope: 'local' });
      setTimeout(() => {
        router.replace('/login?reset=success');
      }, 700);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-page-bg flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="app-card-surface w-full max-w-md p-6 sm:p-8">
        <div className="text-center">
          <AppLogoInline href="/" size="lg" priority className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Reset password</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Set a new password for your account.
          </p>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Validating reset link…</p>
        ) : !ready ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400">
              {message?.text ?? 'This link has expired. Request a new password reset.'}
            </p>
            <Link href="/login" className="app-link-accent text-sm">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
                className="app-input"
              />
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
                className="app-input"
              />
            </div>
            {message && (
              <p
                className={`text-sm ${
                  message.type === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {message.text}
              </p>
            )}
            <button type="submit" disabled={saving} className="app-btn-primary w-full">
              {saving ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-bg flex min-h-[50vh] items-center justify-center text-slate-500 dark:text-slate-400">
          Loading…
        </div>
      }
    >
      <ResetPasswordPageContent />
    </Suspense>
  );
}
