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

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [systemMode, setSystemMode] = useState<
    'NORMAL' | 'MAINTENANCE' | 'READ_ONLY' | 'EMERGENCY_LOCKDOWN'
  >('NORMAL');
  const [systemMessage, setSystemMessage] = useState<string | null>(null);

  const supabase = createClient();
  const nextPath = safeNextPath(searchParams.get('next'));
  const isAdminContext = searchParams.get('context') === 'admin' || nextPath.startsWith('/admin');
  const plan = searchParams.get('plan')?.trim() ?? '';
  const billing = normalizeBillingIntervalParam(searchParams.get('billing'));
  const isPricingIntent = plan === 'growth' || plan === 'professional' || plan === 'enterprise';

  async function refreshLoginContext(): Promise<{
    loginAllowed: boolean;
    mode: 'NORMAL' | 'MAINTENANCE' | 'READ_ONLY' | 'EMERGENCY_LOCKDOWN';
    message: string | null;
  }> {
    const res = await fetch('/api/auth/login-context', { cache: 'no-store' });
    const json = (await res.json()) as {
      login_allowed?: boolean;
      system_mode?: string;
      system_message?: string | null;
    };
    const modeRaw = String(json.system_mode ?? 'NORMAL').toUpperCase();
    const mode =
      modeRaw === 'MAINTENANCE' || modeRaw === 'READ_ONLY' || modeRaw === 'EMERGENCY_LOCKDOWN'
        ? modeRaw
        : 'NORMAL';
    const msg = json.system_message ? String(json.system_message) : null;
    setSystemMode(mode);
    setSystemMessage(msg);
    return { loginAllowed: Boolean(json.login_allowed ?? true), mode, message: msg };
  }

  useEffect(() => {
    void refreshLoginContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signupHref = (() => {
    const params = new URLSearchParams();
    if (email.trim()) params.set('email', email.trim());
    if (searchParams.get('next')) params.set('next', nextPath);
    if (isPricingIntent) {
      params.set('plan', plan);
      params.set('billing', billing);
    }
    return `/signup${params.toString() ? `?${params.toString()}` : ''}`;
  })();

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const context = await refreshLoginContext();
      if (!context.loginAllowed) {
        setMessage({
          type: 'error',
          text: context.message ?? 'We’ve temporarily restricted access while we address a critical issue. Please try again later.',
        });
        return;
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not validate system access. Please try again.' });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setMessage({ type: 'success', text: 'Redirecting...' });
    try {
      await fetch('/api/auth/login-activity', { method: 'POST' });
    } catch {
      /* non-blocking */
    }
    window.location.href = nextPath;
  }

  async function signInWithGoogle() {
    setLoading(true);
    try {
      const context = await refreshLoginContext();
      if (!context.loginAllowed) {
        setLoading(false);
        setMessage({
          type: 'error',
          text: context.message ?? 'We’ve temporarily restricted access while we address a critical issue. Please try again later.',
        });
        return;
      }
    } catch {
      setLoading(false);
      setMessage({ type: 'error', text: 'Could not validate system access. Please try again.' });
      return;
    }
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
            Sign in to your account
          </h1>
          {isAdminContext ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Sign in to access the Zenzex admin panel.</p>
          ) : null}
        </div>

        <form onSubmit={signInWithEmail} className="space-y-4">
          {systemMode === 'MAINTENANCE' && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {systemMessage ??
                'We’re performing maintenance. You can still sign in, but some features may be temporarily unavailable.'}
            </p>
          )}
          {systemMode === 'READ_ONLY' && (
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              {systemMessage ??
                'The system is temporarily in read-only mode while we perform updates. You can still access your account and view data.'}
            </p>
          )}
          {systemMode === 'EMERGENCY_LOCKDOWN' && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {systemMessage ??
                'We’ve temporarily restricted access while we address a critical issue. Please try again later.'}
            </p>
          )}
          {searchParams.get('verified') === 'success' && !message && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Email verified successfully. Please sign in to continue.
            </p>
          )}
          {searchParams.get('reset') === 'success' && !message && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Password updated successfully. Please sign in.
            </p>
          )}
          {searchParams.get('error') === 'link_expired' && !message && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              This verification link is invalid or expired. Please request a new one.
            </p>
          )}
          {searchParams.get('error') === 'auth' && !message && (
            <p className="text-sm text-red-600 dark:text-red-400">
              We couldn&apos;t complete sign-in from that link. Please sign in manually.
            </p>
          )}
          {searchParams.get('notice') === 'system_lockdown' && !message && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {searchParams.get('message')?.trim() ||
                'We’ve temporarily restricted access while we address a critical issue. Please try again later.'}
            </p>
          )}
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
              className="app-input"
            />
            <div className="mt-1.5 flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          {message && (
            <p
              className={`text-sm ${message.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}
            >
              {message.text}
            </p>
          )}
          <button type="submit" disabled={loading} className="app-btn-primary w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

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

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          Don&apos;t have an account?{' '}
          <Link href={signupHref} className="app-link-accent">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-bg flex min-h-[50vh] items-center justify-center text-slate-500 dark:text-slate-400">
          Loading…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
