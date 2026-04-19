import { NextResponse } from 'next/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { sendSignupVerificationViaGenerateLink } from '@/lib/auth/signup-verification-delivery';
import {
  executeSignupResend,
  getClientIp,
  getEmailRedirectToForSignupResend,
  logSignupResendAttempt,
  normalizeSignupEmail,
} from '@/lib/auth/signup-resend';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const raw = String(body.email ?? '');
  const resendPassword = body.password ? String(body.password) : undefined;
  const normalized = normalizeSignupEmail(raw);
  const ip = getClientIp(req);

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service temporarily unavailable.' }, { status: 503 });
  }

  if (!normalized) {
    const stored = raw.trim().toLowerCase().slice(0, 512) || '(empty)';
    await logSignupResendAttempt(admin, {
      email_normalized: stored,
      ip_address: ip,
      outcome: 'invalid_email',
      detail: null,
    });
    return NextResponse.json({ ok: false, error: 'Invalid email address.' }, { status: 400 });
  }

  const emailRedirectTo = getEmailRedirectToForSignupResend();

  const result = await executeSignupResend(admin, {
    emailNormalized: normalized,
    ip,
    resend: async (email) =>
      sendSignupVerificationViaGenerateLink(admin, email, {
        password: resendPassword,
        redirectTo: emailRedirectTo,
      }),
  });

  if (!result.ok) {
    if (result.status === 429) {
      console.warn('[signup-resend] rate_limited', { hasIp: Boolean(ip) });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    message: result.message,
  });
}
