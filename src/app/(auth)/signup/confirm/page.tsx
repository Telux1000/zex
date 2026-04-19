'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLogoInline } from '@/components/branding/AppLogoInline';
import { useRouter, useSearchParams } from 'next/navigation';

const COOLDOWN_MIN_SEC = 30;
const COOLDOWN_MAX_SEC = 60;

function randomCooldownSeconds() {
  return COOLDOWN_MIN_SEC + Math.floor(Math.random() * (COOLDOWN_MAX_SEC - COOLDOWN_MIN_SEC + 1));
}

function SignupConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramEmail = searchParams.get('email')?.trim() ?? '';

  const [email, setEmail] = useState(paramEmail);
  const [resendPassword, setResendPassword] = useState('');
  const [cooldownSec, setCooldownSec] = useState(() => randomCooldownSeconds());
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setEmail(paramEmail);
  }, [paramEmail]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownSec]);

  const startCooldown = useCallback(() => {
    setCooldownSec(randomCooldownSeconds());
  }, []);

  const onResend = async () => {
    setFeedback(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', text: 'Enter your email address.' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/resend-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          ...(resendPassword.trim() ? { password: resendPassword } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        sent?: boolean;
        message?: string;
        error?: string;
      };

      if (res.status === 429) {
        setFeedback({
          type: 'error',
          text: data.error ?? 'Too many resend attempts. Please try again later.',
        });
        return;
      }

      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: data.error ?? 'Something went wrong. Please try again.',
        });
        return;
      }

      if (data.sent) {
        setFeedback({ type: 'success', text: data.message ?? 'Email sent again.' });
        startCooldown();
      } else {
        setFeedback({
          type: 'error',
          text: data.message ?? 'Unable to send the email right now.',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  if (!paramEmail && !email) {
    return (
      <div className="app-page-bg flex flex-col items-center justify-center px-4 py-12">
        <div className="app-card-surface w-full max-w-md space-y-6 p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Check your email</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No email address was provided. Start from the signup page to receive a verification link.
          </p>
          <Link href="/signup" className="app-btn-primary inline-flex w-full justify-center">
            Go to sign up
          </Link>
        </div>
      </div>
    );
  }

  const resendDisabled = loading || cooldownSec > 0;

  return (
    <div className="app-page-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="app-card-surface w-full max-w-md space-y-6 p-6 sm:p-8">
        <div className="text-center">
          <AppLogoInline href="/" size="lg" priority className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Verify your email</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            We sent a verification link to confirm your signup. Use the button in that email to activate your account.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Sending to
          </p>
          <p className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-white">{email || '—'}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email address
          </label>
          <input
            id="confirm-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="app-input"
            placeholder="you@company.com"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Wrong address? Update it here before resending, or{' '}
            <Link href={`/signup?email=${encodeURIComponent(email.trim())}`} className="app-link-accent">
              sign up again
            </Link>{' '}
            with the correct email.
          </p>
        </div>

        {feedback && (
          <p
            className={`text-sm ${feedback.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}
          >
            {feedback.text}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label
              htmlFor="resend-password"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Password <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="resend-password"
              type="password"
              value={resendPassword}
              onChange={(e) => setResendPassword(e.target.value)}
              autoComplete="current-password"
              className="app-input"
              placeholder="Add if resend without password fails"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              We try email-only first. If that doesn’t work, enter the password you used at signup and resend.
            </p>
          </div>
          <button
            type="button"
            onClick={onResend}
            disabled={resendDisabled}
            className="app-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Resend email'}
          </button>
          {cooldownSec > 0 && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Resend available in {cooldownSec}s
            </p>
          )}
        </div>

        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Didn&apos;t receive it?</h2>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
            <li>Check your spam or promotions folder.</li>
            <li>Confirm the email address above matches the one you used to sign up.</li>
          </ul>
        </div>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          <button type="button" onClick={() => router.push('/login')} className="app-link-accent">
            Back to sign in
          </button>
        </p>
      </div>
    </div>
  );
}

export default function SignupConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-bg flex min-h-screen items-center justify-center px-4">
          <div className="text-sm text-slate-500">Loading…</div>
        </div>
      }
    >
      <SignupConfirmInner />
    </Suspense>
  );
}
