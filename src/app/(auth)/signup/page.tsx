'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppLogoInline } from '@/components/branding/AppLogoInline';
import { normalizeBillingIntervalParam } from '@/lib/billing/pricing-cta';

function safeNextPath(raw: string | null): string {
  const value = (raw ?? '/dashboard').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

const CLOSED_SIGNUP_DEFAULT_MESSAGE =
  'We’re temporarily pausing new signups while we perform updates. Please check back shortly.';

function SignupPageInner() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signupMode, setSignupMode] = useState<'OPEN' | 'CLOSED' | 'INVITE_ONLY'>('OPEN');
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [signupContextError, setSignupContextError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [contextLoaded, setContextLoaded] = useState(false);

  const supabase = createClient();
  const nextPath = safeNextPath(searchParams.get('next'));
  const plan = searchParams.get('plan')?.trim() ?? '';
  const billing = normalizeBillingIntervalParam(searchParams.get('billing'));
  const isPricingIntent = plan === 'growth' || plan === 'professional' || plan === 'enterprise';

  const loginHref = (() => {
    const params = new URLSearchParams();
    params.set('next', nextPath);
    if (isPricingIntent) {
      params.set('plan', plan);
      params.set('billing', billing);
    }
    return `/login?${params.toString()}`;
  })();

  useEffect(() => {
    const pre = searchParams.get('email')?.trim();
    if (pre) setEmail(pre);
    const inviteFromQuery = searchParams.get('invite')?.trim();
    if (inviteFromQuery) setInviteToken(inviteFromQuery);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/signup-context', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (r) => {
        const json = (await r.json().catch(() => ({}))) as {
          signup_mode?: string;
          signup_message?: string | null;
          error?: string;
        };
        if (!r.ok) {
          throw new Error(
            typeof json.error === 'string' && json.error.trim()
              ? json.error.trim()
              : 'Could not verify signup availability.'
          );
        }
        return json;
      })
      .then((json) => {
        if (!active) return;
        setSignupContextError(null);
        const mode = String(json?.signup_mode ?? 'OPEN').toUpperCase();
        const normalized = mode === 'CLOSED' || mode === 'INVITE_ONLY' ? mode : 'OPEN';
        setSignupMode(normalized);
        setSignupMessage(json?.signup_message ? String(json.signup_message) : null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message =
          err instanceof Error && err.message.trim()
            ? err.message.trim()
            : 'Could not verify signup availability.';
        // Fail closed when signup policy cannot be loaded.
        setSignupMode('CLOSED');
        setSignupMessage(message);
        setSignupContextError(message);
      })
      .finally(() => {
        if (active) setContextLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function signUp(e: React.FormEvent) {
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
          invite_token: inviteToken.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Sign up failed.');
        return;
      }
      const params = new URLSearchParams({ email: email.trim(), next: nextPath });
      if (isPricingIntent) {
        params.set('plan', plan);
        params.set('billing', billing);
      }
      window.location.assign(`/signup/confirm?${params.toString()}`);
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
    });
  }

  return (
    <div className="app-page-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="app-card-surface w-full max-w-sm space-y-8 p-6 sm:p-8">
        <div className="text-center">
          <AppLogoInline href="/" size="lg" priority className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">
            Create your account
          </h1>
        </div>

        {!contextLoaded ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Checking signup availability…</p>
        ) : signupContextError ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
            <p className="font-medium">{signupContextError}</p>
          </div>
        ) : signupMode === 'CLOSED' ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">{signupMessage ?? CLOSED_SIGNUP_DEFAULT_MESSAGE}</p>
          </div>
        ) : (
        <form onSubmit={signUp} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="app-input"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="app-input"
            />
          </div>
          {signupMode === 'INVITE_ONLY' && (
            <div>
              <label htmlFor="invite-token" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Invite code
              </label>
              <input
                id="invite-token"
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                required
                className="app-input"
                placeholder="Paste your invite code"
              />
              {signupMessage && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{signupMessage}</p>
              )}
            </div>
          )}
          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          )}
          <button type="submit" disabled={loading} className="app-btn-primary w-full">
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>
        )}

        {signupMode === 'OPEN' && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--card-border)]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-[var(--card)] px-2 text-slate-500 dark:text-slate-400">
                  Or continue with
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="app-btn-secondary flex w-full items-center justify-center gap-2"
            >
              Google
            </button>
          </>
        )}

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          Already have an account?{' '}
          <Link href={loginHref} className="app-link-accent">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-bg flex min-h-screen items-center justify-center px-4">
          <div className="text-sm text-slate-500">Loading…</div>
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}
