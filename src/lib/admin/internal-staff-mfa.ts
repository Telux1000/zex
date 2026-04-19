import type { SupabaseClient } from '@supabase/supabase-js';

type AdminAuth = {
  mfa?: {
    listFactors: (params: { userId: string }) => Promise<{
      data?: { factors?: { status?: string }[] } | null;
      error?: { message?: string } | null;
    }>;
  };
};

export type InternalStaffMfaStatus = 'verified' | 'none' | 'unknown';

export async function getInternalStaffMfaStatus(
  admin: SupabaseClient,
  userId: string
): Promise<InternalStaffMfaStatus> {
  try {
    const mfa = (admin.auth.admin as AdminAuth).mfa;
    if (!mfa?.listFactors) return 'unknown';
    const { data, error } = await mfa.listFactors({ userId });
    if (error) return 'unknown';
    const factors = data?.factors ?? [];
    return factors.some((f) => f.status === 'verified') ? 'verified' : 'none';
  } catch {
    return 'unknown';
  }
}

/** Gate: unknown MFA state does not block access (avoid outages if Auth admin MFA is unavailable). */
export async function userHasVerifiedMfaFactor(admin: SupabaseClient, userId: string): Promise<boolean> {
  const s = await getInternalStaffMfaStatus(admin, userId);
  if (s === 'unknown') return true;
  return s === 'verified';
}

export async function mapUserIdsToMfaStatus(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, InternalStaffMfaStatus>> {
  const out = new Map<string, InternalStaffMfaStatus>();
  await Promise.all(
    userIds.map(async (id) => {
      const s = await getInternalStaffMfaStatus(admin, id);
      out.set(id, s);
    })
  );
  return out;
}
