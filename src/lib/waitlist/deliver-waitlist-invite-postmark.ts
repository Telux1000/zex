import { sendEmail } from '@/services/postmark';
import {
  waitlistTransactionalEmailFooterHtml,
  waitlistTransactionalEmailHeaderHtml,
  waitlistTransactionalEmailSiteLabel,
} from '@/lib/waitlist/waitlist-email-branding';

const SUBJECT = "You're invited to Zenzex 🎉";

export async function deliverWaitlistInviteEmail(params: {
  to: string;
  inviteUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const siteLabel = waitlistTransactionalEmailSiteLabel();
  const textBody = [
    "You're invited to join Zenzex with early access.",
    '',
    'Zenzex helps you invoice faster, follow up automatically, and get paid with less admin.',
    '',
    `Your personal invite link (limited early access):\n${params.inviteUrl}`,
    '',
    'This link expires in 14 days. If it stops working, reply and we can send a fresh invite.',
    '',
    `— Zenzex\nhttps://${siteLabel}`,
  ].join('\n');

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.55; color: #1e293b;">
  ${waitlistTransactionalEmailHeaderHtml()}
  <p><strong>You're invited</strong> to join Zenzex with early access.</p>
  <p>Zenzex helps you invoice faster, follow up automatically, and get paid with less admin.</p>
  <p style="margin: 1.25rem 0;"><a href="${params.inviteUrl}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Accept your invite</a></p>
  <p style="font-size: 14px; color: #64748b;"><strong>Limited early access</strong> — this link expires in 14 days.</p>
  ${waitlistTransactionalEmailFooterHtml()}
</body>
</html>`.trim();

  const r = await sendEmail({
    to: params.to,
    subject: SUBJECT,
    textBody,
    htmlBody,
    tag: 'waitlist-invite',
    metadata: { kind: 'waitlist_invite' },
  });

  if (!r.ok) {
    console.error('[waitlist-invite-postmark]', r.error);
    return { ok: false, error: r.error ?? 'send failed' };
  }
  return { ok: true };
}
