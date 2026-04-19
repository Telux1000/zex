import { sendEmail, sendTemplatedEmail, resolvePostmarkTemplateFromEnv } from '@/services/postmark';

const POSTMARK_WELCOME_TEMPLATE_ENV = 'POSTMARK_TEMPLATE_WELCOME_SETUP_COMPLETE';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFallbackWelcomeHtml(params: {
  firstName: string;
  businessName: string;
  dashboardUrl: string;
  createInvoiceUrl: string;
  addCustomerUrl: string;
  supportEmail: string;
  appName: string;
  year: string;
}) {
  const dash = escapeHtml(params.dashboardUrl);
  const inv = escapeHtml(params.createInvoiceUrl);
  const cust = escapeHtml(params.addCustomerUrl);
  const sup = escapeHtml(params.supportEmail);
  const app = escapeHtml(params.appName);
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.6;color:#0f172a;background:#f8fafc;padding:24px;">
<p style="font-size:24px;margin:0 0 12px 0;">🎉</p>
<p>Hi ${escapeHtml(params.firstName)},</p>
<p><strong>You&apos;re all set with ${app}.</strong> Your workspace for <strong>${escapeHtml(params.businessName)}</strong> is ready.</p>
<p><strong>What&apos;s next</strong></p>
<ul>
<li><a href="${cust}">Create your first customer</a></li>
<li><a href="${inv}">Create your first invoice</a></li>
<li><a href="${dash}">Explore your dashboard</a></li>
</ul>
<p><a href="${dash}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Go to dashboard</a></p>
<p style="font-size:13px;color:#64748b;">Questions? <a href="mailto:${sup}">${sup}</a></p>
<p style="font-size:12px;color:#94a3b8;">© ${escapeHtml(params.year)} ${app}</p>
</body></html>`;
}

function buildFallbackWelcomeText(params: {
  firstName: string;
  businessName: string;
  dashboardUrl: string;
  createInvoiceUrl: string;
  addCustomerUrl: string;
  supportEmail: string;
  appName: string;
  year: string;
}) {
  return `Hi ${params.firstName},

You're all set with ${params.appName}. Your workspace for ${params.businessName} is ready.

Go to dashboard:
${params.dashboardUrl}

What's next:
· Create your first customer: ${params.addCustomerUrl}
· Create your first invoice: ${params.createInvoiceUrl}
· Explore your dashboard: ${params.dashboardUrl}

Questions? ${params.supportEmail}

© ${params.year} ${params.appName}`;
}

/**
 * Postmark template alias: `welcome_message` (see postmark/welcome_message.html).
 * Subject in Postmark: You're all set with {{app_name}} 🎉
 * Merge fields: first_name, business_name, dashboard_url, support_email, app_name, year
 */
export async function deliverOnboardingWelcomeEmail(params: {
  to: string;
  firstName: string;
  businessName: string;
  dashboardUrl: string;
  createInvoiceUrl: string;
  addCustomerUrl: string;
  supportEmail: string;
  appName: string;
  year: string;
}) {
  const tpl = resolvePostmarkTemplateFromEnv(POSTMARK_WELCOME_TEMPLATE_ENV);
  if (tpl.templateId || tpl.templateAlias) {
    return sendTemplatedEmail({
      to: params.to,
      templateId: tpl.templateId,
      templateAlias: tpl.templateAlias,
      templateModel: {
        first_name: params.firstName,
        business_name: params.businessName,
        dashboard_url: params.dashboardUrl,
        support_email: params.supportEmail,
        app_name: params.appName,
        year: params.year,
      },
      tag: 'onboarding-welcome',
      metadata: { flow: 'setup_complete' },
    });
  }

  return sendEmail({
    to: params.to,
    subject: `You're all set with ${params.appName} 🎉`,
    htmlBody: buildFallbackWelcomeHtml(params),
    textBody: buildFallbackWelcomeText(params),
    tag: 'onboarding-welcome',
    metadata: { flow: 'setup_complete' },
  });
}
