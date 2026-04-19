'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { clearAssistantLocalDeviceCache } from '@/lib/assistant/conversation-storage';
import { deviceLabelFromUserAgent } from '@/lib/auth/device-label';
import type { Factor, Session } from '@supabase/supabase-js';

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 transition duration-150 dark:border-gray-600 dark:bg-gray-800 dark:text-white';

const cardClass =
  'rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition duration-150 dark:border-gray-800 dark:bg-gray-900';

const badgeEnabled =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400';
const badgeDisabled =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
const badgeWarn =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400';
const badgeThis =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300';

type LoginEventRow = {
  id: string;
  occurred_at: string;
  status: 'success' | 'failed';
  device_label: string | null;
  ip_display: string | null;
};

type Props = {
  onPasswordSuccess?: () => void;
  onClearSuccess?: () => void;
};

function ModalBackdrop({
  children,
  onClose,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/45 transition duration-150"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative z-[101] w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl transition duration-150 dark:border-gray-700 dark:bg-gray-900"
      >
        {children}
      </div>
    </div>
  );
}

export function SecuritySettingsPanel({ onPasswordSuccess, onClearSuccess }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loginEmail, setLoginEmail] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [mfaLoadError, setMfaLoadError] = useState<string | null>(null);
  const [loginEvents, setLoginEvents] = useState<LoginEventRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [requireCurrentPassword, setRequireCurrentPassword] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [mfaStep, setMfaStep] = useState<'idle' | 'qr'>('idle');
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  const [confirmOthersOpen, setConfirmOthersOpen] = useState(false);
  const [confirmLocalOpen, setConfirmLocalOpen] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionMsg, setSessionMsg] = useState<string | null>(null);

  const currentDeviceLabel = useMemo(
    () => (typeof navigator !== 'undefined' ? deviceLabelFromUserAgent(navigator.userAgent) : 'This device'),
    []
  );
  const approxLocation = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  }, []);

  const verifiedTotp = useMemo(
    () => factors.find((f) => f.factor_type === 'totp' && f.status === 'verified'),
    [factors]
  );

  const refreshFactors = useCallback(async () => {
    setMfaLoadError(null);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMfaLoadError(error.message);
      setFactors([]);
      return;
    }
    setFactors(data?.all ?? []);
  }, [supabase]);

  const refreshSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
  }, [supabase]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch('/api/auth/login-activity');
      const body = await res.json();
      if (res.ok && Array.isArray(body.events)) {
        setLoginEvents(body.events);
      } else {
        setLoginEvents([]);
      }
    } catch {
      setLoginEvents([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        if (!cancelled && res.ok) {
          setLoginEmail((data.user?.email as string | null) ?? null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshFactors();
    refreshSession();
    loadActivity();
  }, [refreshFactors, refreshSession, loadActivity]);

  function resetPwdModal() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setRequireCurrentPassword(true);
    setPasswordBusy(false);
    setPasswordError(null);
    setPasswordSuccess(null);
  }

  function closePwdModal() {
    setPwdOpen(false);
    resetPwdModal();
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    onClearSuccess?.();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (requireCurrentPassword && !currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (!newPassword) {
      setPasswordError('New password is required.');
      return;
    }
    if (!confirmNewPassword) {
      setPasswordError('Confirm your new password.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (!loginEmail) {
      setPasswordError('Missing account email. Reload and try again.');
      return;
    }

    setPasswordBusy(true);
    try {
      if (requireCurrentPassword) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: currentPassword,
        });
        if (verifyErr) {
          setPasswordError('Current password is incorrect.');
          return;
        }
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) {
        setPasswordError('Could not update password. Please try again.');
        return;
      }

      setPasswordSuccess(
        requireCurrentPassword ? 'Password changed successfully.' : 'Password set successfully.'
      );
      onPasswordSuccess?.();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => closePwdModal(), 900);
    } finally {
      setPasswordBusy(false);
    }
  }

  async function startEnroll() {
    setMfaError(null);
    setMfaBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
        issuer: 'Zenzex',
      });
      if (error || !data || data.type !== 'totp' || !data.totp?.qr_code) {
        setMfaError(error?.message ?? 'Could not start 2FA enrollment. Ensure TOTP is enabled for your project.');
        return;
      }
      setEnrollFactorId(data.id);
      setEnrollQr(data.totp.qr_code);
      setMfaStep('qr');
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollFactorId || !mfaCode.trim()) {
      setMfaError('Enter the code from your authenticator app.');
      return;
    }
    setMfaBusy(true);
    setMfaError(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollFactorId,
        code: mfaCode.replace(/\s/g, ''),
      });
      if (error) {
        setMfaError(error.message);
        return;
      }
      setMfaStep('idle');
      setEnrollFactorId(null);
      setEnrollQr(null);
      setMfaCode('');
      await refreshFactors();
      await refreshSession();
    } finally {
      setMfaBusy(false);
    }
  }

  async function cancelEnroll() {
    const fid = enrollFactorId;
    setMfaStep('idle');
    setEnrollFactorId(null);
    setEnrollQr(null);
    setMfaCode('');
    setMfaError(null);
    if (fid) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: fid });
      } catch {
        /* ignore */
      }
    }
    await refreshFactors();
  }

  async function submitDisable2FA(e: React.FormEvent) {
    e.preventDefault();
    if (!verifiedTotp) return;
    if (!disableCode.trim()) {
      setDisableError('Enter your authenticator code.');
      return;
    }
    setDisableBusy(true);
    setDisableError(null);
    try {
      const { error: vErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId: verifiedTotp.id,
        code: disableCode.replace(/\s/g, ''),
      });
      if (vErr) {
        setDisableError(vErr.message);
        return;
      }
      const { error: uErr } = await supabase.auth.mfa.unenroll({ factorId: verifiedTotp.id });
      if (uErr) {
        setDisableError(uErr.message);
        return;
      }
      setDisableOpen(false);
      setDisableCode('');
      await refreshFactors();
      await refreshSession();
    } finally {
      setDisableBusy(false);
    }
  }

  async function logoutOthers() {
    setSessionBusy(true);
    setSessionMsg(null);
    onClearSuccess?.();
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) {
        setSessionMsg(error.message);
        return;
      }
      setConfirmOthersOpen(false);
      setSessionMsg('Signed out of all other sessions.');
    } finally {
      setSessionBusy(false);
    }
  }

  async function logoutThisDevice() {
    setSessionBusy(true);
    onClearSuccess?.();
    try {
      clearAssistantLocalDeviceCache();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        setSessionMsg(error.message);
        return;
      }
      window.location.href = '/login';
    } finally {
      setSessionBusy(false);
    }
  }

  const displayEvents: LoginEventRow[] = useMemo(() => {
    if (loginEvents.length > 0) return loginEvents;
    const at = session?.user?.last_sign_in_at;
    if (!at) return [];
    return [
      {
        id: 'fallback-last',
        occurred_at: at,
        status: 'success',
        device_label: currentDeviceLabel,
        ip_display: null,
      },
    ];
  }, [loginEvents, session?.user?.last_sign_in_at, currentDeviceLabel]);

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Change Password</h2>
        <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          Update the password you use to sign in with email.
        </p>
        <button
          type="button"
          onClick={() => {
            onClearSuccess?.();
            setPwdOpen(true);
            setPasswordError(null);
            setPasswordSuccess(null);
          }}
          className="app-btn-primary transition duration-150"
        >
          Change Password
        </button>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Two-Factor Authentication (2FA)
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Add an extra layer of security to your account.
            </p>
          </div>
          {verifiedTotp ? (
            <span className={badgeEnabled}>Enabled</span>
          ) : (
            <span className={badgeDisabled}>Disabled</span>
          )}
        </div>
        {mfaLoadError && (
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">{mfaLoadError}</p>
        )}
        {!verifiedTotp && mfaStep === 'idle' && (
          <button
            type="button"
            disabled={mfaBusy}
            onClick={() => void startEnroll()}
            className="app-btn-primary transition duration-150"
          >
            {mfaBusy ? 'Starting…' : 'Enable 2FA'}
          </button>
        )}
        {verifiedTotp && (
          <button
            type="button"
            onClick={() => {
              setDisableOpen(true);
              setDisableCode('');
              setDisableError(null);
            }}
            className="app-btn-secondary transition duration-150"
          >
            Disable 2FA
          </button>
        )}
        {mfaStep === 'qr' && enrollQr && (
          <div className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Step 1 — Scan QR code</p>
            <img
              src={enrollQr}
              alt="QR code for authenticator setup"
              className="mx-auto h-40 w-40 rounded-md border border-gray-200 bg-white p-2 dark:border-gray-600"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">Step 2 — Enter the 6-digit code to verify.</p>
            <form onSubmit={confirmEnroll} className="space-y-3">
              <div>
                <label className={labelClass} htmlFor="mfa-enroll-code">
                  Verification code
                </label>
                <input
                  id="mfa-enroll-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className={inputClass}
                  placeholder="000000"
                />
              </div>
              {mfaError && <p className="text-sm text-red-600 dark:text-red-400">{mfaError}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={mfaBusy} className="app-btn-primary transition duration-150">
                  {mfaBusy ? 'Confirming…' : 'Confirm & enable'}
                </button>
                <button
                  type="button"
                  onClick={() => void cancelEnroll()}
                  className="app-btn-secondary transition duration-150"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active Sessions</h2>
        <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          Devices where your account may be signed in. Revoke access you don&apos;t recognize.
        </p>
        {sessionMsg && (
          <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">
            {sessionMsg}
          </p>
        )}
        <ul className="divide-y divide-gray-200 dark:divide-gray-800">
          <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-gray-900 dark:text-white">{currentDeviceLabel}</p>
                <span className={badgeThis}>This device</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {approxLocation ? `Region: ${approxLocation}` : 'Location unavailable'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Last active: Active now</p>
            </div>
            <button
              type="button"
              disabled={sessionBusy}
              onClick={() => setConfirmLocalOpen(true)}
              className="shrink-0 app-btn-secondary transition duration-150"
            >
              Log out
            </button>
          </li>
          <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 dark:text-white">Other browsers &amp; devices</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Other sessions aren&apos;t listed individually. Sign out everywhere except this browser.
              </p>
            </div>
            <button
              type="button"
              disabled={sessionBusy}
              onClick={() => setConfirmOthersOpen(true)}
              className="shrink-0 app-btn-secondary transition duration-150"
            >
              Log out of all other sessions
            </button>
          </li>
        </ul>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Login Activity</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Recent sign-ins recorded for your account.
            </p>
          </div>
          <Link
            href="/settings?section=audit"
            className="text-sm font-medium text-indigo-600 transition duration-150 hover:underline dark:text-indigo-400"
          >
            View all activity
          </Link>
        </div>
        {activityLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : displayEvents.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No recent sign-ins recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {displayEvents.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3 dark:border-gray-800 dark:bg-gray-800/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {format(parseISO(ev.occurred_at), 'MMM d, yyyy · HH:mm')}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {ev.device_label ?? 'Unknown device'}
                    {ev.ip_display ? ` · ${ev.ip_display}` : ''}
                  </p>
                </div>
                <span className={ev.status === 'success' ? badgeEnabled : badgeWarn}>
                  {ev.status === 'success' ? 'Success' : 'Failed'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pwdOpen && (
        <ModalBackdrop onClose={closePwdModal} labelledBy="pwd-modal-title">
          <h4 id="pwd-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Change Password
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Enter your current password and choose a new one.
          </p>
          <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
            {requireCurrentPassword && (
              <div>
                <label className={labelClass} htmlFor="sec-current-password">
                  Current Password
                </label>
                <input
                  id="sec-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="sec-new-password">
                New Password
              </label>
              <input
                id="sec-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="sec-confirm-password">
                Confirm Password
              </label>
              <input
                id="sec-confirm-password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={!requireCurrentPassword}
                onChange={(e) => setRequireCurrentPassword(!e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
              />
              I don&apos;t have a password yet
            </label>
            {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
            {passwordSuccess && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{passwordSuccess}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={closePwdModal} className="app-btn-secondary transition duration-150">
                Cancel
              </button>
              <button type="submit" disabled={passwordBusy} className="app-btn-primary transition duration-150">
                {passwordBusy ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {disableOpen && verifiedTotp && (
        <ModalBackdrop
          onClose={() => {
            setDisableOpen(false);
            setDisableCode('');
            setDisableError(null);
          }}
          labelledBy="disable-2fa-title"
        >
          <h4 id="disable-2fa-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Disable two-factor authentication
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This removes the extra step at sign-in. This action cannot be undone for past sessions already
            revoked. Enter a code from your authenticator to confirm.
          </p>
          <form onSubmit={submitDisable2FA} className="mt-4 space-y-4">
            <div>
              <label className={labelClass} htmlFor="disable-mfa-code">
                Authenticator code
              </label>
              <input
                id="disable-mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className={inputClass}
              />
            </div>
            {disableError && <p className="text-sm text-red-600 dark:text-red-400">{disableError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDisableOpen(false);
                  setDisableCode('');
                  setDisableError(null);
                }}
                className="app-btn-secondary transition duration-150"
              >
                Cancel
              </button>
              <button type="submit" disabled={disableBusy} className="app-btn-primary transition duration-150">
                {disableBusy ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {confirmOthersOpen && (
        <ModalBackdrop onClose={() => setConfirmOthersOpen(false)} labelledBy="others-title">
          <h4 id="others-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Log out of all other sessions?
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You will stay signed in on this device. Other devices will need to sign in again.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOthersOpen(false)}
              className="app-btn-secondary transition duration-150"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sessionBusy}
              onClick={() => void logoutOthers()}
              className="app-btn-primary transition duration-150"
            >
              {sessionBusy ? 'Working…' : 'Log out others'}
            </button>
          </div>
        </ModalBackdrop>
      )}

      {confirmLocalOpen && (
        <ModalBackdrop onClose={() => setConfirmLocalOpen(false)} labelledBy="local-title">
          <h4 id="local-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Log out on this device?
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You will be redirected to the sign-in page.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmLocalOpen(false)}
              className="app-btn-secondary transition duration-150"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sessionBusy}
              onClick={() => void logoutThisDevice()}
              className="app-btn-primary transition duration-150"
            >
              {sessionBusy ? 'Signing out…' : 'Log out'}
            </button>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
