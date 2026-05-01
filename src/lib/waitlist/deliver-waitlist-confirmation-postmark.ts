import { sendEmail } from '@/services/postmark';
import {
  waitlistTransactionalEmailFooterHtml,
  waitlistTransactionalEmailHeaderHtml,
  waitlistTransactionalEmailSiteLabel,
} from '@/lib/waitlist/waitlist-email-branding';

const SUBJECT = "You're on the Zenzex waitlist 🚀";

export async function deliverWaitlistConfirmationEmail(params: { to: string }): Promise<{ ok: boolean; error?: string }> {
  const siteLabel = waitlistTransactionalEmailSiteLabel();
  const textBody = [
    "Thanks for joining the Zenzex waitlist.",
    '',
    "You're in line for early access as we expand regions, currencies, and payment options.",
    '',
    "What to expect:",
    "- A short confirmation like this when you join",
    "- A heads-up when your spot opens — no spam",
    '- Early access to the features you care about',
    '',
    `— Zenzex\nhttps://${siteLabel}`,
  ].join('\n');

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.5; color: #1e293b;">
  ${waitlistTransactionalEmailHeaderHtml()}
  <p>Thanks for joining the <strong>Zenzex</strong> waitlist.</p>
  <p>You're in line for <strong>early access</strong> as we expand regions, currencies, and payment options.</p>
  <p><strong>What to expect</strong></p>
  <ul>
    <li>A short confirmation when you join</li>
    <li>A heads-up when your spot opens — no spam</li>
    <li>Early access to the features you care about</li>
  </ul>
  ${waitlistTransactionalEmailFooterHtml()}
</body>
</html>`.trim();

  const r = await sendEmail({
    to: params.to,
    subject: SUBJECT,
    textBody,
    htmlBody,
    tag: 'waitlist-confirmation',
    metadata: { kind: 'waitlist_signup' },
  });

  if (!r.ok) {
    console.error('[waitlist-postmark]', r.error);
    return { ok: false, error: r.error ?? 'send failed' };
  }
  return { ok: true };
}
