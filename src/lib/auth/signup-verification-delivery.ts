import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverSignupConfirmationPostmark } from '@/lib/auth/deliver-signup-confirmation-postmark';
import { getEmailRedirectToForSignupResend } from '@/lib/auth/signup-resend';

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
 * Builds a verification link via Admin API (does not trigger Supabase's built-in mailer),
 * then sends the message through Postmark.
 *
 * Order: magiclink (no password) → signup+password if provided and magiclink failed.
 */
export async function sendSignupVerificationViaGenerateLink(
  admin: SupabaseClient,
  email: string,
  options: { password?: string; redirectTo?: string }
): Promise<{ error: Error | null }> {
  const redirect = options.redirectTo ?? getEmailRedirectToForSignupResend();

  let res = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: redirect ? { redirectTo: redirect } : undefined,
  });

  if ((res.error || !res.data?.properties?.action_link) && options.password) {
    res = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password: options.password,
      options: redirect ? { redirectTo: redirect } : undefined,
    });
  }

  if (res.error) {
    return { error: new Error(res.error.message) };
  }

  const linkRaw = res.data?.properties?.action_link;
  const otp = res.data?.properties?.email_otp ?? '';
  if (!linkRaw) {
    return { error: new Error('No confirmation link generated') };
  }
  const link = enforceSafeRedirectOnActionLink(linkRaw, redirect);

  try {
    await deliverSignupConfirmationPostmark({
      to: email,
      confirmUrl: link,
      token: otp,
      tag: 'signup-resend',
    });
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('Email delivery failed') };
  }

  return { error: null };
}
