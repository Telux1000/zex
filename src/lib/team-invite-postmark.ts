import { sendEmail, sendTemplatedEmail, resolvePostmarkTemplateFromEnv } from '@/services/postmark';

const POSTMARK_INVITE_TEMPLATE_ENV = 'POSTMARK_TEMPLATE_USER_INVITATION';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFallbackInviteHtml(params: {
  inviteUrl: string;
  businessName: string;
  inviterName: string;
  roleLabel: string;
  recipientEmail: string;
}) {
  const link = escapeHtml(params.inviteUrl);
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f8fafc;padding:24px;">
<p><strong>${escapeHtml(params.inviterName)}</strong> invited you to join <strong>${escapeHtml(params.businessName)}</strong> on Zenzex.</p>
<p>Role: <strong>${escapeHtml(params.roleLabel)}</strong></p>
<p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">Accept invitation</a></p>
<p style="font-size:13px;color:#64748b;">This link will expire shortly for your security.</p>
<p style="font-size:13px;color:#64748b;">This message was sent to ${escapeHtml(params.recipientEmail)}.</p>
</body></html>`;
}

export async function deliverTeamInviteEmail(params: {
  to: string;
  inviteUrl: string;
  businessName: string;
  inviterName: string;
  roleLabel: string;
  businessId: string;
}) {
  const tpl = resolvePostmarkTemplateFromEnv(POSTMARK_INVITE_TEMPLATE_ENV);
  if (tpl.templateId || tpl.templateAlias) {
    return sendTemplatedEmail({
      to: params.to,
      templateId: tpl.templateId,
      templateAlias: tpl.templateAlias,
      templateModel: {
        business_name: String(params.businessName),
        inviter_name: String(params.inviterName),
        role_label: String(params.roleLabel),
        invite_url: String(params.inviteUrl),
        recipient_email: String(params.to),
        current_year: String(new Date().getFullYear()),
      },
      tag: 'team-invite',
      metadata: { business_id: params.businessId },
    });
  }

  return sendEmail({
    to: params.to,
    subject: `You’re invited to join ${params.businessName} on Zenzex`,
    htmlBody: buildFallbackInviteHtml({
      inviteUrl: params.inviteUrl,
      businessName: params.businessName,
      inviterName: params.inviterName,
      roleLabel: params.roleLabel,
      recipientEmail: params.to,
    }),
    tag: 'team-invite',
    metadata: { business_id: params.businessId },
  });
}
