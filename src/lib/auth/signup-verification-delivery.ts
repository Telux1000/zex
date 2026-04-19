import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverSignupConfirmationPostmark } from '@/lib/auth/deliver-signup-confirmation-postmark';

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
  const redirect = options.redirectTo;

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

  const link = res.data?.properties?.action_link;
  const otp = res.data?.properties?.email_otp ?? '';
  if (!link) {
    return { error: new Error('No confirmation link generated') };
  }

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
