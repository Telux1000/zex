import { sendEmail, sendTemplatedEmail, resolvePostmarkTemplateFromEnv } from '@/services/postmark';

const POSTMARK_SIGNUP_TEMPLATE_ENV = 'POSTMARK_TEMPLATE_SIGNUP_CONFIRM';

/** Env var name for the Postmark signup template (alias or numeric ID). */
export { POSTMARK_SIGNUP_TEMPLATE_ENV };

/**
 * Single source of truth for Postmark merge fields on signup / magic-link style emails.
 * The real confirmation URL must always be Supabase’s verify link or `generateLink` `action_link` — never `/login`.
 *
 * - `confirm_url` — primary; use in HTML as `{{confirm_url}}` (Postmark).
 * - `confirmation_url` / `magic_link_url` — aliases for custom templates (e.g. legacy names).
 */
export function buildSignupConfirmationTemplateModel(input: {
  confirmUrl: string;
  token: string;
  recipientEmail: string;
  productName?: string;
  expiryHours?: string;
}): Record<string, string> {
  const u = String(input.confirmUrl ?? '').trim();
  const product_name = String(input.productName ?? 'Zenzex').trim() || 'Zenzex';
  return {
    product_name,
    year: String(new Date().getFullYear()),
    recipient_email: input.recipientEmail,
    confirm_url: u,
    confirmation_url: u,
    magic_link_url: u,
    reset_url: u,
    token: String(input.token ?? ''),
    token_new: '',
    site_url: '',
    expiry_hours: String(input.expiryHours ?? '24'),
  };
}

export function assertPostmarkSendOk(
  result: { ok: boolean; error?: string | null },
  context: string
): void {
  if (result.ok) return;
  const msg = result.error ?? 'Postmark send failed';
  console.error(`[postmark-auth] send failed (${context}):`, msg);
  throw new Error(`Postmark (${context}): ${msg}`);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFallbackSignupHtml(params: { confirmUrl: string; token: string; productName: string }) {
  const href = escapeHtml(params.confirmUrl);
  const tokenHtml = params.token
    ? `<p style="margin:16px 0 0 0;font-size:13px;color:#64748b;">Or enter this code:</p><p style="margin:8px 0 0 0;font-size:18px;font-weight:700;letter-spacing:0.12em;color:#0f172a;">${escapeHtml(params.token)}</p>`
    : '';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
<tr><td style="padding:28px 32px 8px 32px;font-family:system-ui,sans-serif;">
<p style="margin:0;font-size:13px;font-weight:600;color:#6366f1;">${escapeHtml(params.productName)}</p>
<h1 style="margin:12px 0 0 0;font-size:22px;color:#0f172a;">Confirm your signup</h1>
<p style="margin:16px 0 0 0;font-size:15px;line-height:1.6;color:#475569;">Click the button below to confirm your email and continue securely.</p>
</td></tr>
<tr><td style="padding:12px 32px 24px 32px;text-align:center;">
<a href="${href}" style="display:inline-block;padding:14px 32px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:10px;font-size:16px;font-weight:600;">Confirm signup</a>
</td></tr>
<tr><td style="padding:0 32px 24px 32px;font-family:system-ui,sans-serif;">
<p style="margin:0;font-size:13px;color:#64748b;">If the button does not work, open this link:</p>
<p style="margin:8px 0 0 0;word-break:break-all;font-size:12px;"><a href="${href}" style="color:#4f46e5;">${href}</a></p>
${tokenHtml}
<p style="margin:20px 0 0 0;font-size:13px;color:#94a3b8;">If you didn&apos;t request this, you can safely ignore this email.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Sends signup-style confirmation (Postmark template or HTML fallback).
 * Used by the Supabase Send Email hook and `admin.generateLink` flows.
 * `confirmUrl` must be the full Supabase verification or action link — never a bare app `/login` URL.
 */
export async function deliverSignupConfirmationPostmark(params: {
  to: string;
  confirmUrl: string;
  token: string;
  subject?: string;
  tag?: string;
  productName?: string;
}): Promise<void> {
  const subject = params.subject ?? 'Confirm your Zenzex signup';
  const productName = params.productName ?? 'Zenzex';
  const model = buildSignupConfirmationTemplateModel({
    confirmUrl: params.confirmUrl,
    token: params.token,
    recipientEmail: params.to,
    productName,
  });

  const tpl = resolvePostmarkTemplateFromEnv(POSTMARK_SIGNUP_TEMPLATE_ENV);
  if (tpl.templateId || tpl.templateAlias) {
    assertPostmarkSendOk(
      await sendTemplatedEmail({
        to: params.to,
        templateId: tpl.templateId,
        templateAlias: tpl.templateAlias,
        templateModel: model,
        tag: params.tag ?? 'signup-confirm',
      }),
      `template:${POSTMARK_SIGNUP_TEMPLATE_ENV}`
    );
    return;
  }

  assertPostmarkSendOk(
    await sendEmail({
      to: params.to,
      subject,
      htmlBody: buildFallbackSignupHtml({
        confirmUrl: params.confirmUrl,
        token: params.token,
        productName,
      }),
      textBody: [
        'Confirm your signup',
        '',
        'Click the link below to confirm your email and continue securely:',
        params.confirmUrl,
        '',
        params.token ? `Or enter this code: ${params.token}` : '',
        '',
        "If you didn't request this, you can safely ignore this email.",
        '',
        `— ${productName}`,
      ]
        .filter(Boolean)
        .join('\n'),
      tag: params.tag ?? 'signup-confirm',
    }),
    'signup-fallback-html'
  );
}
