import { NextResponse } from 'next/server';
import { deliverSignupConfirmationPostmark } from '@/lib/auth/deliver-signup-confirmation-postmark';
import {
  enforceSignupConfirmationRedirectOnActionLink,
  getEmailRedirectToForSignupResend,
  normalizeSignupEmail,
} from '@/lib/auth/signup-resend';
import { markWaitlistActivatedOnSignup } from '@/lib/waitlist/mark-waitlist-activated';
import { consumeSignupInvite, fetchSignupSettings, validateSignupAccess } from '@/lib/auth/signup-control';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export const dynamic = 'force-dynamic';

/**
 * Email/password signup without calling client signUp(), so Supabase never sends its default
 * "Confirm your signup" message. Uses admin.generateLink (signup), then Postmark — same as docs
 * "custom email provider" flow.
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string; invite_token?: string; waitlist_invite_token?: string };
  try {
    body = (await req.json()) as {
      email?: string;
      password?: string;
      invite_token?: string;
      waitlist_invite_token?: string;
    };
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

  let signupSettings;
  try {
    signupSettings = await fetchSignupSettings(admin);
  } catch (e) {
    console.error('[signup-email] failed to load signup settings', e);
    return NextResponse.json(
      { ok: false, error: 'Could not verify signup availability. Please try again shortly.' },
      { status: 503 }
    );
  }
  const access = await validateSignupAccess({
    admin,
    mode: signupSettings.signup_mode,
    email: normalized,
    inviteToken: body.invite_token,
    waitlistInviteToken: body.waitlist_invite_token,
  });
  if (!access.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: access.error,
        signup_mode: signupSettings.signup_mode,
        signup_message: signupSettings.signup_message,
      },
      { status: access.status }
    );
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

  if (access.inviteIdToConsume) {
    const consumed = await consumeSignupInvite({
      admin,
      inviteId: access.inviteIdToConsume,
      userId: data?.user?.id ?? null,
    });
    if (!consumed) {
      return NextResponse.json({ ok: false, error: 'Invite required to register' }, { status: 403 });
    }
  }

  if (data?.user?.id) {
    await markWaitlistActivatedOnSignup(admin, { userId: data.user.id, email: normalized });
  }

  const actionLinkRaw = data?.properties?.action_link;
  const otp = data?.properties?.email_otp ?? '';
  if (!actionLinkRaw) {
    console.error('[signup-email] missing action_link');
    return NextResponse.json({ ok: false, error: 'Could not complete signup.' }, { status: 500 });
  }
  const actionLink = enforceSignupConfirmationRedirectOnActionLink(actionLinkRaw, redirectTo);

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
