import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverSignupConfirmationPostmark } from '@/lib/auth/deliver-signup-confirmation-postmark';
import {
  enforceSignupConfirmationRedirectOnActionLink,
  getEmailRedirectToForSignupResend,
} from '@/lib/auth/signup-resend';

/**
 * Builds a verification link via Admin API (does not trigger Supabase's built-in mailer),
 * then sends the message through Postmark.
 */
export async function sendSignupVerificationViaGenerateLink(
  admin: SupabaseClient,
  email: string,
  options: { password?: string; redirectTo?: string }
): Promise<{ error: Error | null }> {
  const redirect = options.redirectTo ?? getEmailRedirectToForSignupResend();
  const password = String(options.password ?? '').trim();

  if (!password) {
    return {
      error: new Error(
        'Please enter your signup password and try resend again. For security, signup resend uses signup verification links only.'
      ),
    };
  }

  const res = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: redirect ? { redirectTo: redirect } : undefined,
  });

  if (res.error) {
    return { error: new Error(res.error.message) };
  }

  const linkRaw = res.data?.properties?.action_link;
  const otp = res.data?.properties?.email_otp ?? '';
  if (!linkRaw) {
    return { error: new Error('No confirmation link generated') };
  }
  const link = enforceSignupConfirmationRedirectOnActionLink(linkRaw, redirect);

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
