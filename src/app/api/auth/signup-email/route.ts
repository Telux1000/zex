import { NextResponse } from 'next/server';
import { deliverSignupConfirmationPostmark } from '@/lib/auth/deliver-signup-confirmation-postmark';
import { getEmailRedirectToForSignupResend, normalizeSignupEmail } from '@/lib/auth/signup-resend';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export const dynamic = 'force-dynamic';

function isLocalhostRedirect(raw: string | null): boolean {
  const value = String(raw ?? '').toLowerCase();
  return value.includes('localhost') || value.includes('127.0.0.1') || value.includes('0.0.0.0');
}

function enforceSafeRedirectOnActionLink(actionLink: string, redirectTo?: string): string {
  const safeRedirect = String(redirectTo ?? '').trim();
  if (!safeRedirect) return actionLink;
  try {
    const u = new URL(actionLink);
    const existing = u.searchParams.get('redirect_to');
    if (!existing || isLocalhostRedirect(existing)) {
      u.searchParams.set('redirect_to', safeRedirect);
    }
    return u.toString();
  } catch {
    return actionLink;
  }
}

/**
 * Email/password signup without calling client signUp(), so Supabase never sends its default
 * "Confirm your signup" message. Uses admin.generateLink (signup), then Postmark — same as docs
 * "custom email provider" flow.
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const emailRaw = String(body.email ?? '');
  const normalized = normalizeSignupEmail(emailRaw);
  const password = String(body.password ?? '');

  if (!normalized) {
    return NextResponse.json({ ok: false, error: 'Invalid email address.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { ok: false, error: 'Password must be at least 6 characters.' },
      { status: 400 }
    );
  }
  if (password.length > 128) {
    return NextResponse.json({ ok: false, error: 'Password is too long.' }, { status: 400 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service temporarily unavailable.' }, { status: 503 });
  }

  const requestOrigin = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return undefined;
    }
  })();
  const redirectTo = getEmailRedirectToForSignupResend(requestOrigin);
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: normalized,
    password,
    options: redirectTo ? { redirectTo } : undefined,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('exists') ||
      msg.includes('duplicate')
    ) {
      return NextResponse.json(
        { ok: false, error: 'An account with this email already exists. Try signing in.' },
        { status: 409 }
      );
    }
    console.error('[signup-email] generateLink', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const actionLinkRaw = data?.properties?.action_link;
  const otp = data?.properties?.email_otp ?? '';
  if (!actionLinkRaw) {
    console.error('[signup-email] missing action_link');
    return NextResponse.json({ ok: false, error: 'Could not complete signup.' }, { status: 500 });
  }
  const actionLink = enforceSafeRedirectOnActionLink(actionLinkRaw, redirectTo);

  try {
    await deliverSignupConfirmationPostmark({
      to: normalized,
      confirmUrl: actionLink,
      token: otp,
      tag: 'signup-email-api',
    });
  } catch (e) {
    console.error('[signup-email] Postmark', e);
    return NextResponse.json(
      {
        ok: false,
        error: 'Could not send verification email. Check Postmark and POSTMARK_TEMPLATE_SIGNUP_CONFIRM.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
