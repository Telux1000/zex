import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { fetchInternalSecuritySettings } from '@/lib/admin/internal-security-settings';
import { userHasVerifiedMfaFactor } from '@/lib/admin/internal-staff-mfa';

const mfaCache = new Map<string, { at: number; ok: boolean }>();
const TTL_MS = 45_000;

/** Invalidate MFA verification cache (e.g. after user enrolls MFA). */
export function invalidateInternalStaffMfaCacheForUser(userId: string) {
  mfaCache.delete(userId);
}

export function invalidateAllInternalStaffMfaCache() {
  mfaCache.clear();
}

/**
 * When internal security policy requires MFA, internal staff must have at least one verified factor.
 */
export async function internalStaffMfaGateOk(userId: string): Promise<boolean> {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return true;

  const settings = await fetchInternalSecuritySettings(admin);
  if (!settings.require_mfa_for_internal_staff) return true;

  const now = Date.now();
  const hit = mfaCache.get(userId);
  if (hit && now - hit.at < TTL_MS) return hit.ok;

  const ok = await userHasVerifiedMfaFactor(admin, userId);
  mfaCache.set(userId, { at: now, ok });
  return ok;
}
