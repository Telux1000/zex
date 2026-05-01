/** Public marketing host for transactional email (waitlist, invites) and logo assets. */
export const ZENZEX_WWW_ORIGIN = 'https://www.zenzex.com';

/** Absolute URL for the app mark; email clients require HTTPS and a public host. */
export function getZenzexEmailLogoUrl(): string {
  return `${ZENZEX_WWW_ORIGIN}/zenzex-mark.png`;
}

/** Footer / copy in waitlist + invite emails always point at the live www site. */
export function getWaitlistInviteEmailSiteUrl(): string {
  return ZENZEX_WWW_ORIGIN;
}

/**
 * Base for `/invite/...` links: normalize apex or www production to {@link ZENZEX_WWW_ORIGIN};
 * keep preview / local {@link getAppBaseUrl} so tokens still hit the deployed preview app.
 */
export function getWaitlistInviteLinkBaseUrl(): string {
  const base = getAppBaseUrl();
  try {
    const host = new URL(base).hostname.toLowerCase();
    if (host === 'www.zenzex.com' || host === 'zenzex.com') {
      return ZENZEX_WWW_ORIGIN;
    }
  } catch {
    /* ignore */
  }
  return base;
}

/** Server-only: canonical public origin for payment redirects. */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const v = process.env.VERCEL_URL?.trim();
  if (v) return `https://${v.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}
