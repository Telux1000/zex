'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

export function InviteWaitlistPageClient({
  inviteToken,
  defaultEmail,
}: {
  inviteToken: string;
  defaultEmail: string;
}) {
  const [email] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/signup-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          waitlist_invite_token: inviteToken,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Sign up failed.');
        return;
      }
      const params = new URLSearchParams({ email: email.trim() });
      window.location.assign(`/signup/confirm?${params.toString()}`);
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-page-bg flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="app-card-surface w-full max-w-sm space-y-6 p-6 sm:p-8">
        <div className="text-center">
          <AppLogoInline href="/" size="lg" priority className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">You&apos;re invited</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Create your Zenzex account with this early-access link. Limited-time invite.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              readOnly
              required
              className="app-input cursor-not-allowed bg-slate-50 dark:bg-slate-900/50"
            />
          </div>
          <div>
            <label htmlFor="invite-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              minLength={6}
              className="app-input"
              autoComplete="new-password"
            />
          </div>
          {errorMessage ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
              {errorMessage}
            </div>
          ) : null}
          <button type="submit" disabled={loading} className="app-btn-primary w-full py-2.5 text-sm font-semibold">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="app-link-accent">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
