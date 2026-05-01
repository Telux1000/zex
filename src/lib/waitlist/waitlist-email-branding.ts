import { getWaitlistInviteEmailSiteUrl, getZenzexEmailLogoUrl } from '@/lib/billing/app-base-url';

/** Shared HTML header: Zenzex mark linking to www.zenzex.com (email-safe). */
export function waitlistTransactionalEmailHeaderHtml(): string {
  const site = getWaitlistInviteEmailSiteUrl();
  const logo = getZenzexEmailLogoUrl();
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr>
    <td>
      <a href="${site}" style="text-decoration:none;display:inline-block;">
        <img src="${logo}" width="44" height="44" alt="Zenzex" style="display:block;border:0;height:auto;max-width:44px;" />
      </a>
    </td>
  </tr>
</table>`.trim();
}

/** Footer line with www host label and link to https://www.zenzex.com */
export function waitlistTransactionalEmailFooterHtml(): string {
  const site = getWaitlistInviteEmailSiteUrl();
  return `<p style="margin-top: 1.5rem; color: #64748b; font-size: 14px;">— Zenzex · <a href="${site}" style="color: #4f46e5;">www.zenzex.com</a></p>`;
}

export function waitlistTransactionalEmailSiteLabel(): string {
  return 'www.zenzex.com';
}
