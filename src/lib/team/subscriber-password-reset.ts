import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { sendEmail, sendTemplatedEmail, resolvePostmarkTemplateFromEnv } from '@/services/postmark';

/** Same Postmark template as the standard user-facing reset path (`POSTMARK_TEMPLATE_USER_PASSWORD_RESET`). */
const POSTMARK_USER_PASSWORD_RESET_TEMPLATE_ENV = 'POSTMARK_TEMPLATE_USER_PASSWORD_RESET';

function appResetPasswordUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return base ? `${base}/reset-password` : undefined;
}

export type SendSubscriberPasswordResetResult =
  | { ok: true; email: string }
  | { ok: false; error: string; status: number };

/**
 * Generate a Supabase recovery link and send the same user-facing password-reset email as other client flows
 * (Postmark: POSTMARK_TEMPLATE_USER_PASSWORD_RESET; fallback matches /api/auth/forgot-password).
 */
export async function sendSubscriberPasswordResetEmail(params: {
  targetUserId: string;
  businessId?: string | null;
}): Promise<SendSubscriberPasswordResetResult> {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return { ok: false, error: 'Server misconfigured', status: 503 };

  const { data: targetAuth, error: getErr } = await admin.auth.admin.getUserById(params.targetUserId);
  if (getErr || !targetAuth.user?.email) {
    return { ok: false, error: getErr?.message ?? 'Target user email not found', status: 404 };
  }
  const email = String(targetAuth.user.email).toLowerCase();
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: appResetPasswordUrl() },
  });
  if (linkErr || !linkData.properties?.action_link) {
    return { ok: false, error: linkErr?.message ?? 'Failed to generate reset link', status: 400 };
  }
  const resetUrl = String(linkData.properties.action_link);
  const tpl = resolvePostmarkTemplateFromEnv(POSTMARK_USER_PASSWORD_RESET_TEMPLATE_ENV);
  const metadata: Record<string, string> = {
    business_id: params.businessId != null ? String(params.businessId) : '',
    target_user_id: params.targetUserId,
  };
  const result =
    tpl.templateId || tpl.templateAlias
      ? await sendTemplatedEmail({
          to: email,
          templateId: tpl.templateId,
          templateAlias: tpl.templateAlias,
          templateModel: {
            reset_url: resetUrl,
            expiry_minutes: '60',
            year: String(new Date().getFullYear()),
            recipient_email: email,
          },
          tag: 'password-reset',
          metadata,
        })
      : await sendEmail({
          to: email,
          subject: 'Reset your Zenzex password',
          htmlBody: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Reset password</a></p>`,
          tag: 'password-reset',
          metadata,
        });
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Failed to send reset email', status: 502 };
  }
  return { ok: true, email };
}
