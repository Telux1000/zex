import { Webhook } from 'standardwebhooks';
import { sendEmail, sendTemplatedEmail, resolvePostmarkTemplateFromEnv } from '@/services/postmark';
import {
  assertPostmarkSendOk,
  buildSignupConfirmationTemplateModel,
  deliverSignupConfirmationPostmark,
} from '@/lib/auth/deliver-signup-confirmation-postmark';

export type SupabaseSendEmailHookPayload = {
  user: {
    email: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
    old_email?: string;
    old_phone?: string;
    provider?: string;
    factor_type?: string;
  };
};

function normalizeHookSecret(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('v1,')) return trimmed.slice(3);
  return trimmed;
}

export function verifySupabaseSendEmailHook(
  rawBody: string,
  headers: Record<string, string>
): SupabaseSendEmailHookPayload {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('Missing SEND_EMAIL_HOOK_SECRET');
  }
  const wh = new Webhook(normalizeHookSecret(secret));
  return wh.verify(rawBody, headers) as SupabaseSendEmailHookPayload;
}

export function buildSupabaseVerifyUrl(
  emailData: SupabaseSendEmailHookPayload['email_data']
): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!base || !emailData.token_hash) return null;
  const u = new URL(`${base}/auth/v1/verify`);
  u.searchParams.set('token', emailData.token_hash);
  u.searchParams.set('type', emailData.email_action_type);
  if (emailData.redirect_to) {
    u.searchParams.set('redirect_to', emailData.redirect_to);
  }
  return u.toString();
}

const SUBJECT_BY_TYPE: Record<string, string> = {
  signup: 'Confirm your Zenzex signup',
  recovery: 'Reset your Zenzex password',
  magiclink: 'Your Zenzex sign-in link',
  invite: 'You’re invited to Zenzex',
  email_change: 'Confirm your email change',
  email_change_new: 'Confirm your new email address',
  reauthentication: 'Your Zenzex verification code',
  email: 'Your Zenzex verification code',
  password_changed_notification: 'Your Zenzex password was changed',
  email_changed_notification: 'Your Zenzex email was changed',
  phone_changed_notification: 'Your phone number was changed',
  identity_linked_notification: 'A sign-in method was linked to your account',
  identity_unlinked_notification: 'A sign-in method was removed from your account',
  mfa_factor_enrolled_notification: 'Two-step verification was enabled',
  mfa_factor_unenrolled_notification: 'Two-step verification was disabled',
};

function subjectFor(action: string): string {
  return SUBJECT_BY_TYPE[action] ?? 'Notification from Zenzex';
}

export async function deliverAuthEmailFromHook(payload: SupabaseSendEmailHookPayload): Promise<void> {
  const { user, email_data: ed } = payload;
  const email = String(user?.email ?? '').trim();
  if (!email) {
    throw new Error('Send Email hook payload missing user.email');
  }

  const action = ed.email_action_type;
  const confirmUrl = buildSupabaseVerifyUrl(ed);
  const subject = subjectFor(action);
  /** Shared shape with signup Postmark template; magic link = Supabase `/auth/v1/verify?...` (never `/login`). */
  const model = {
    ...buildSignupConfirmationTemplateModel({
      confirmUrl: confirmUrl ?? '',
      token: ed.token ?? '',
      recipientEmail: email,
    }),
    token_new: ed.token_new ?? '',
    site_url: ed.site_url ?? '',
  };

  const forgotTpl = resolvePostmarkTemplateFromEnv('POSTMARK_TEMPLATE_FORGOT_PASSWORD');

  if (action === 'signup' || action === 'magiclink' || action === 'invite') {
    if (!confirmUrl) {
      throw new Error('Send Email hook: missing confirmation URL for signup-type action');
    }
    await deliverSignupConfirmationPostmark({
      to: email,
      confirmUrl,
      token: ed.token ?? '',
      subject,
      tag: `auth-hook-${action}`,
    });
    return;
  }

  if (action === 'recovery') {
    if (forgotTpl.templateId || forgotTpl.templateAlias) {
      assertPostmarkSendOk(
        await sendTemplatedEmail({
          to: email,
          templateId: forgotTpl.templateId,
          templateAlias: forgotTpl.templateAlias,
          templateModel: { ...model, reset_url: confirmUrl ?? '' },
          tag: 'auth-recovery',
        }),
        'template:forgot-password'
      );
      return;
    }
  }

  if (action === 'email_change' || action === 'email_change_new') {
    const html = `
      <p>Hi,</p>
      <p>We received a request to update the email on your Zenzex account.</p>
      ${confirmUrl ? `<p><a href="${confirmUrl}">Confirm this change</a></p>` : ''}
      ${ed.token ? `<p>Or enter this code: <strong>${ed.token}</strong></p>` : ''}
      ${ed.token_new ? `<p>Second code: <strong>${ed.token_new}</strong></p>` : ''}
      <p>— Zenzex</p>
    `;
    assertPostmarkSendOk(
      await sendEmail({
        to: email,
        subject,
        htmlBody: html,
        tag: `auth-${action}`,
      }),
      'email_change'
    );
    return;
  }

  if (
    action.endsWith('_notification') ||
    action === 'reauthentication' ||
    action === 'email'
  ) {
    const html = `
      <p>Hi,</p>
      <p>${subject}.</p>
      ${ed.token ? `<p>Verification code: <strong>${ed.token}</strong></p>` : ''}
      <p>If this wasn’t you, secure your account and contact support.</p>
      <p>— Zenzex</p>
    `;
    assertPostmarkSendOk(
      await sendEmail({ to: email, subject, htmlBody: html, tag: `auth-${action}` }),
      action
    );
    return;
  }

  const fallbackHtml = `
    <p>Hi,</p>
    ${confirmUrl ? `<p><a href="${confirmUrl}">${subject}</a></p>` : `<p>${subject}</p>`}
    ${ed.token ? `<p>Code: <strong>${ed.token}</strong></p>` : ''}
    <p>— Zenzex</p>
  `;
  assertPostmarkSendOk(
    await sendEmail({
      to: email,
      subject,
      htmlBody: fallbackHtml,
      tag: `auth-${action}`,
    }),
    `fallback:${action}`
  );
}
