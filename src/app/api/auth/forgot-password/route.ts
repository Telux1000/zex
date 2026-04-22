import { NextResponse } from 'next/server';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { sendEmail, sendTemplatedEmail, resolvePostmarkTemplateFromEnv } from '@/services/postmark';

function appResetPasswordUrl(preferredOrigin?: string) {
  const base = resolveAppBaseUrl(preferredOrigin);
  return base ? `${base}/reset-password` : undefined;
}

const POSTMARK_FORGOT_PASSWORD_TEMPLATE_ENV = 'POSTMARK_TEMPLATE_FORGOT_PASSWORD';

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: true });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ ok: true });
  }

  const requestOrigin = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return undefined;
    }
  })();
  const redirectTo = appResetPasswordUrl(requestOrigin);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });

  if (!linkErr && linkData?.properties?.action_link) {
    const resetUrl = String(linkData.properties.action_link);
    const tpl = resolvePostmarkTemplateFromEnv(POSTMARK_FORGOT_PASSWORD_TEMPLATE_ENV);
    if (tpl.templateId || tpl.templateAlias) {
      await sendTemplatedEmail({
        to: email,
        templateId: tpl.templateId,
        templateAlias: tpl.templateAlias,
        templateModel: {
          reset_url: resetUrl,
          expiry_minutes: '60',
          year: String(new Date().getFullYear()),
          recipient_email: email,
        },
        tag: 'forgot-password',
      });
    } else {
      await sendEmail({
        to: email,
        subject: 'Reset your Zenzex password',
        htmlBody: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Reset password</a></p>`,
        tag: 'forgot-password',
      });
    }
  }

  return NextResponse.json({ ok: true });
}
