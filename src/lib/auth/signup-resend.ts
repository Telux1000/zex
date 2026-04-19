import type { SupabaseClient } from '@supabase/supabase-js';

/** Production signup-resend caps (rolling windows). Do not raise without product/security review. */
export const SIGNUP_RESEND_LIMITS = {
  /** Successful resend emails per normalized address, last 60 minutes */
  maxSentPerEmailPerHour: 5,
  /** Successful resend emails per normalized address, last 24 hours */
  maxSentPerEmailPerDay: 5,
  /** Any logged resend attempt per client IP (excl. invalid_email), last 60 minutes */
  maxRequestsPerIpPerHour: 25,
} as const;

const RATE_LIMIT_ERROR = 'Too many resend attempts. Please try again later.';

export type SignupResendOutcome =
  | 'sent'
  | 'rate_limited_email_hour'
  | 'rate_limited_email_day'
  | 'rate_limited_ip'
  | 'invalid_email'
  | 'supabase_error';

export function normalizeSignupEmail(raw: string): string | null {
  const e = String(raw ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 128);
  return null;
}

function appAuthCallbackUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return base ? `${base}/auth/callback` : undefined;
}

export async function logSignupResendAttempt(
  admin: SupabaseClient,
  input: {
    email_normalized: string;
    ip_address: string | null;
    outcome: SignupResendOutcome;
    detail?: string | null;
  }
): Promise<void> {
  const detail =
    input.detail && input.detail.length > 500 ? input.detail.slice(0, 500) : input.detail ?? null;
  const { error } = await admin.from('signup_resend_attempts').insert({
    email_normalized: input.email_normalized,
    ip_address: input.ip_address,
    outcome: input.outcome,
    detail,
  });
  if (error) {
    console.error('[signup-resend] log insert failed', error.message);
  }
}

async function countSentSince(
  admin: SupabaseClient,
  emailNorm: string,
  sinceIso: string
): Promise<number> {
  const { count, error } = await admin
    .from('signup_resend_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('email_normalized', emailNorm)
    .eq('outcome', 'sent')
    .gte('created_at', sinceIso);

  if (error) {
    console.error('[signup-resend] count sent failed', error.message);
    throw new Error('Rate check failed');
  }
  return count ?? 0;
}

async function countIpRequestsSince(
  admin: SupabaseClient,
  ip: string,
  sinceIso: string
): Promise<number> {
  const { count, error } = await admin
    .from('signup_resend_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .neq('outcome', 'invalid_email')
    .gte('created_at', sinceIso);

  if (error) {
    console.error('[signup-resend] count ip failed', error.message);
    throw new Error('Rate check failed');
  }
  return count ?? 0;
}

export type ResendSignupResult =
  | { ok: true; sent: true; message: string }
  | { ok: true; sent: false; message: string }
  | { ok: false; status: 429; error: string }
  | { ok: false; status: 503; error: string };

/**
 * Enforces per-email and per-IP limits, logs every outcome, triggers Supabase signup resend.
 */
export async function executeSignupResend(
  admin: SupabaseClient,
  input: { emailNormalized: string; ip: string | null; resend: (email: string) => Promise<{ error: Error | null }> }
): Promise<ResendSignupResult> {
  const { emailNormalized, ip, resend } = input;
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  let sentHour: number;
  let sentDay: number;
  try {
    sentHour = await countSentSince(admin, emailNormalized, hourAgo);
    sentDay = await countSentSince(admin, emailNormalized, dayAgo);
  } catch {
    return { ok: false, status: 503, error: 'Service temporarily unavailable.' };
  }

  if (sentHour >= SIGNUP_RESEND_LIMITS.maxSentPerEmailPerHour) {
    await logSignupResendAttempt(admin, {
      email_normalized: emailNormalized,
      ip_address: ip,
      outcome: 'rate_limited_email_hour',
      detail: `sent_count_1h=${sentHour}`,
    });
    return { ok: false, status: 429, error: RATE_LIMIT_ERROR };
  }

  if (sentDay >= SIGNUP_RESEND_LIMITS.maxSentPerEmailPerDay) {
    await logSignupResendAttempt(admin, {
      email_normalized: emailNormalized,
      ip_address: ip,
      outcome: 'rate_limited_email_day',
      detail: `sent_count_24h=${sentDay}`,
    });
    return { ok: false, status: 429, error: RATE_LIMIT_ERROR };
  }

  if (ip) {
    let ipHour: number;
    try {
      ipHour = await countIpRequestsSince(admin, ip, hourAgo);
    } catch {
      return { ok: false, status: 503, error: 'Service temporarily unavailable.' };
    }
    if (ipHour >= SIGNUP_RESEND_LIMITS.maxRequestsPerIpPerHour) {
      await logSignupResendAttempt(admin, {
        email_normalized: emailNormalized,
        ip_address: ip,
        outcome: 'rate_limited_ip',
        detail: `ip_requests_1h=${ipHour}`,
      });
      return { ok: false, status: 429, error: RATE_LIMIT_ERROR };
    }
  }

  const { error } = await resend(emailNormalized);

  if (error) {
    await logSignupResendAttempt(admin, {
      email_normalized: emailNormalized,
      ip_address: ip,
      outcome: 'supabase_error',
      detail: error.message,
    });
    return {
      ok: true,
      sent: false,
      message: 'Unable to send the email right now. Please try again in a few minutes.',
    };
  }

  await logSignupResendAttempt(admin, {
    email_normalized: emailNormalized,
    ip_address: ip,
    outcome: 'sent',
    detail: null,
  });

  return { ok: true, sent: true, message: 'Email sent again.' };
}

export function getEmailRedirectToForSignupResend(): string | undefined {
  return appAuthCallbackUrl();
}
