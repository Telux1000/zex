import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

function waitlistLandingDevLog(message: string) {
  if (process.env.NODE_ENV === 'production') return;
  console.log(`[waitlist] ${message}`);
}

export type GetPublicWaitlistEnabledOptions = {
  /** When true (non-production only), log `[waitlist] landing_read …` for debugging admin vs landing. */
  debugLog?: boolean;
};

/**
 * Public marketing flag: `admin_platform_settings.waitlist_enabled` (id = default).
 * Uses a direct column read (not `fetchAdminPlatformSettings`) so callers are not affected by the
 * 45s in-process cache used elsewhere, and stay aligned with the DB after admin toggles.
 */
export async function getPublicWaitlistEnabled(options?: GetPublicWaitlistEnabledOptions): Promise<boolean> {
  const debug = Boolean(options?.debugLog) && process.env.NODE_ENV !== 'production';
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    if (debug) waitlistLandingDevLog('landing_read waitlist_enabled=true (no service admin, default)');
    return true;
  }

  const { data, error } = await admin
    .from('admin_platform_settings')
    .select('waitlist_enabled')
    .eq('id', 'default')
    .maybeSingle();

  if (error) {
    if (debug) waitlistLandingDevLog(`landing_read waitlist_enabled=true (db error: ${error.message})`);
    return true;
  }
  if (!data) {
    if (debug) waitlistLandingDevLog('landing_read waitlist_enabled=true (no row, default)');
    return true;
  }

  const enabled = (data as { waitlist_enabled?: boolean }).waitlist_enabled !== false;
  if (debug) waitlistLandingDevLog(`landing_read waitlist_enabled=${enabled}`);
  return enabled;
}
