import { sendEmail, sendTemplatedEmail, resolvePostmarkTemplateFromEnv } from '@/services/postmark';

const POSTMARK_INVITE_TEMPLATE_ENV = 'POSTMARK_TEMPLATE_INTERNAL_STAFF_INVITATION';

function fromWithOptionalDisplayName(label: string | null | undefined): string | undefined {
  const base = String(process.env.POSTMARK_FROM_EMAIL ?? '').trim();
  if (!base) return undefined;
  const l = String(label ?? '').trim().slice(0, 120);
  if (!l) return base;
  if (/^[^\s<]+@[^\s>]+$/.test(base)) {
    return `${l} <${base}>`;
  }
  return base;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFallbackHtml(params: {
  inviteUrl: string;
  inviterName: string;
  roleLabel: string;
  recipientEmail: string;
  fullName: string;
}) {
  const link = escapeHtml(params.inviteUrl);
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f8fafc;padding:24px;">
<p><strong>${escapeHtml(params.inviterName)}</strong> invited you to join the Zenzex internal team.</p>
<p>Hi ${escapeHtml(params.fullName)},</p>
<p>Role: <strong>${escapeHtml(params.roleLabel)}</strong></p>
<p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">Accept invitation</a></p>
<p style="font-size:13px;color:#64748b;">This link expires in a few days for your security.</p>
<p style="font-size:13px;color:#64748b;">This message was sent to ${escapeHtml(params.recipientEmail)}.</p>
</body></html>`;
}

export async function deliverInternalStaffInviteEmail(params: {
  to: string;
  inviteUrl: string;
  inviterName: string;
  roleLabel: string;
  recipientEmail: string;
  fullName: string;
  /** BCC operational inbox (e.g. admin alerts) — must differ from `to`. */
  bccAlerts?: string | null;
  /** Shown as From display name when POSTMARK_FROM_EMAIL is a bare address. */
  systemSenderLabel?: string | null;
}) {
  const fromResolved = fromWithOptionalDisplayName(params.systemSenderLabel);
  const bcc =
    params.bccAlerts && params.bccAlerts.trim().toLowerCase() !== params.to.trim().toLowerCase()
      ? params.bccAlerts.trim()
      : undefined;
  const tpl = resolvePostmarkTemplateFromEnv(POSTMARK_INVITE_TEMPLATE_ENV);
  if (tpl.templateId || tpl.templateAlias) {
    return sendTemplatedEmail({
      to: params.to,
      from: fromResolved,
      bcc,
      templateId: tpl.templateId,
      templateAlias: tpl.templateAlias,
      templateModel: {
        inviter_name: String(params.inviterName),
        role_label: String(params.roleLabel),
        invite_url: String(params.inviteUrl),
        recipient_email: String(params.to),
        full_name: String(params.fullName),
        current_year: String(new Date().getFullYear()),
      },
      tag: 'internal-staff-invite',
      metadata: { kind: 'internal_staff_invite' },
    });
  }

  return sendEmail({
    to: params.to,
    from: fromResolved,
    bcc,
    subject: 'You’re invited to join the Zenzex team',
    htmlBody: buildFallbackHtml({
      inviteUrl: params.inviteUrl,
      inviterName: params.inviterName,
      roleLabel: params.roleLabel,
      recipientEmail: params.to,
      fullName: params.fullName,
    }),
    tag: 'internal-staff-invite',
    metadata: { kind: 'internal_staff_invite' },
  });
}
