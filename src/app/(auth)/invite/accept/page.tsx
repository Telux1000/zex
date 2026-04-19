'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

type InviteDetails = {
  ok: true;
  business_name: string;
  email: string;
  role: string;
  role_label: string;
  inviter_name: string;
  expires_at: string;
  has_account: boolean;
};

type InviteErrorPayload = {
  ok: false;
  code?: string;
  error: string;
};

function InviteAcceptInner() {
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [fatal, setFatal] = useState<InviteErrorPayload | null>(null);

  const [token, setToken] = useState('');

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [resending, setResending] = useState(false);

  const autoAcceptTried = useRef(false);

  useEffect(() => {
    const urlToken = searchParams.get('token')?.trim() ?? '';
    if (urlToken) {
      try {
        sessionStorage.setItem('zenzex_invite_accept_token', urlToken);
      } catch {
        // Ignore storage failures.
      }
      setToken(urlToken);
      return;
    }

    try {
      const stored = sessionStorage.getItem('zenzex_invite_accept_token') ?? '';
      setToken(stored);
    } catch {
      setToken('');
    }
  }, [searchParams]);

  const loadDetails = useCallback(async () => {
    if (!token) {
      setFatal({ ok: false, code: 'invalid', error: 'This link is missing invitation details.' });
      setLoading(false);
      return;
    }
    setLoading(true);
    setFatal(null);
    setDetails(null);
    try {
      const res = await fetch(`/api/invite/accept?token=${encodeURIComponent(token)}`);
      const data = (await res.json()) as InviteDetails | InviteErrorPayload;
      if (!data.ok) {
        setFatal(data as InviteErrorPayload);
        setLoading(false);
        return;
      }
      setDetails(data);
    } catch {
      setFatal({ ok: false, error: 'Could not load this invitation. Try again later.' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadDetails();
  }, [loadDetails]);

  const completeAccept = useCallback(async () => {
    if (!token) return { ok: false as const, error: 'Missing token.' };
    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false as const, error: data.error ?? 'Could not complete invitation.' };
    }
    try {
      sessionStorage.removeItem('zenzex_invite_accept_token');
    } catch {
      // Ignore storage failures.
    }
    return { ok: true as const };
  }, [token]);

  useEffect(() => {
    if (!details?.ok || !token || !details.has_account) return;
    const inviteEmail = details.email;

    let cancelled = false;

    async function tryAuto() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user?.email) return;
      if (session.user.email.toLowerCase() !== inviteEmail.toLowerCase()) return;
      if (autoAcceptTried.current) return;
      autoAcceptTried.current = true;
      setBusy(true);
      setMsg(null);
      const r = await completeAccept();
      setBusy(false);
      if (!r.ok) {
        setMsg({ type: 'error', text: r.error });
        autoAcceptTried.current = false;
        return;
      }
      setMsg({ type: 'success', text: 'Welcome! Redirecting…' });
      window.location.href = '/dashboard';
    }

    void tryAuto();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void tryAuto();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [details, token, supabase, completeAccept]);

  async function submitNewUser(e: React.FormEvent) {
    e.preventDefault();
    if (!details || !token) return;
    autoAcceptTried.current = true;
    setMsg(null);
    if (password !== confirmPassword) {
      setMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, full_name: fullName }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg({ type: 'error', text: data.error ?? 'Something went wrong.' });
        return;
      }
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: details.email,
        password,
      });
      if (signErr) {
        setMsg({
          type: 'success',
          text: 'Your account is ready. Sign in with your new password.',
        });
        return;
      }
      window.location.href = '/dashboard';
    } finally {
      setBusy(false);
    }
  }

  async function submitExistingSignInLink(e: React.FormEvent) {
    e.preventDefault();
    if (!details || !token) return;
    setMsg(null);
    setBusy(true);
    try {
      // Magic link redirect should go back to the invite page, not the OAuth callback.
      // Supabase email verification will set the session cookie and then redirect to `emailRedirectTo`.
      const inviteAcceptUrl = `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: details.email,
        options: { emailRedirectTo: inviteAcceptUrl },
      });

      if (error) {
        setMsg({ type: 'error', text: error.message });
        return;
      }

      setMsg({
        type: 'success',
        text: 'Check your email for the sign-in link. It will redirect you to accept the invitation.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function resendInviteLink() {
    if (!token) return;
    setMsg(null);
    setResending(true);
    try {
      const res = await fetch('/api/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg({ type: 'error', text: data.error ?? 'Could not send a new link.' });
        return;
      }
      const newToken = typeof data.token === 'string' ? data.token : '';
      if (newToken) {
        try {
          sessionStorage.setItem('zenzex_invite_accept_token', newToken);
        } catch {
          // Ignore storage failures.
        }
        setToken(newToken);
        const nextUrl = `/invite/accept?token=${encodeURIComponent(newToken)}`;
        window.history.replaceState({}, '', nextUrl);
      }
      setMsg({ type: 'success', text: 'A new secure link has been sent to your email.' });
      setFatal(null);
      setLoading(true);
    } finally {
      setResending(false);
    }
  }

  async function signInWithGoogle() {
    if (!token) return;
    setBusy(true);
    const next = `/invite/accept?token=${encodeURIComponent(token)}`;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  if (loading) {
    return (
      <div className="app-page-bg flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading invitation…</p>
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="app-page-bg flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="app-card-surface w-full max-w-md space-y-4 p-6 sm:p-8">
          <AppLogoInline href="/" size="lg" priority className="flex w-full justify-center" />
          <h1 className="text-center text-lg font-semibold text-slate-900 dark:text-white">
            Invitation unavailable
          </h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">{fatal.error}</p>
          <p className="text-center text-sm text-slate-500 dark:text-slate-500">
            Ask a workspace admin to send a new invitation from Settings → Team.
          </p>
          {msg && (
            <p
              className={`text-center text-sm ${msg.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}
            >
              {msg.text}
            </p>
          )}
          <button
            type="button"
            onClick={() => void resendInviteLink()}
            disabled={!token || resending}
            className="app-btn-secondary block w-full text-center"
          >
            {resending ? 'Sending new link…' : 'Send new link'}
          </button>
          <Link href="/login" className="app-btn-primary block w-full text-center">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="app-page-bg flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="app-card-surface w-full max-w-md space-y-6 p-6 sm:p-8">
        <div className="text-center">
          <AppLogoInline href="/" size="lg" priority className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Accept invitation</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            You&apos;ve been invited to join <span className="font-medium text-slate-800 dark:text-slate-200">{details.business_name}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Role: <RoleBadge role={details.role} className="ml-1 align-middle" />
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-slate-600 dark:text-slate-400">
            Invited by <span className="font-medium text-slate-800 dark:text-slate-200">{details.inviter_name}</span>
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Email{' '}
            <span className="font-mono text-xs text-slate-800 dark:text-slate-200">{details.email}</span>
          </p>
        </div>

        {msg && (
          <p
            className={`text-center text-sm ${msg.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}
          >
            {msg.text}
          </p>
        )}

        {details.has_account ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Continue with your email to accept this invitation.
            </p>
            <form onSubmit={submitExistingSignInLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                <input
                  type="email"
                  value={details.email}
                  readOnly
                  className="app-input mt-1 cursor-not-allowed opacity-80"
                />
              </div>
              <button type="submit" disabled={busy} className="app-btn-primary w-full">
                {busy ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--card-border)]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-[var(--card)] px-2 text-slate-500 dark:text-slate-400">Or</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={busy}
              className="app-btn-secondary w-full"
            >
              Continue with Google
            </button>
          </div>
        ) : (
          <form onSubmit={submitNewUser} className="space-y-4">
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Create your account to accept this invitation.
            </p>
            <div>
              <label htmlFor="full-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Full name
              </label>
              <input
                id="full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                className="app-input mt-1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input type="email" value={details.email} readOnly className="app-input mt-1 cursor-not-allowed opacity-80" />
            </div>
            <div>
              <label htmlFor="pw" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="app-input mt-1"
              />
            </div>
            <div>
              <label htmlFor="pw2" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Confirm password
              </label>
              <input
                id="pw2"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="app-input mt-1"
              />
            </div>
            <button type="submit" disabled={busy} className="app-btn-primary w-full">
              {busy ? 'Creating account…' : 'Create account & join'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-bg flex min-h-screen flex-col items-center justify-center px-4 py-12">
          <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
        </div>
      }
    >
      <InviteAcceptInner />
    </Suspense>
  );
}
