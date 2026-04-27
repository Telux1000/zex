import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import type { BusinessMemberRole, BusinessRole, RbacPermission } from '@/lib/rbac/types';
import { BUSINESS_MEMBER_ROLES } from '@/lib/rbac/types';
import { hasPermission } from '@/lib/rbac/permissions';

/** RBAC permission checked server-side for AI Insights APIs (matches dashboard financial visibility). */
export const AI_INSIGHTS_ACCESS_PERMISSION: RbacPermission = 'view_data';

/**
 * @param options.knownOwnerId - When the caller already loaded `businesses.owner_id` (same request),
 *   pass it to skip a redundant `businesses` select. Must match `businessId` (verified by RLS on prior reads).
 */
export async function getEffectiveBusinessRole(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  options?: { knownOwnerId?: string | null }
): Promise<BusinessRole | null> {
  const known = options?.knownOwnerId;
  let ownerId: string | null = known != null && String(known).trim() !== '' ? String(known) : null;
  if (ownerId == null) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .maybeSingle();
    if (!biz) return null;
    ownerId = String((biz as { owner_id?: string | null }).owner_id ?? '');
  }
  if (ownerId === userId) return 'owner';
  const { data: row } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();
  const r = row?.role;
  if (typeof r === 'string' && (BUSINESS_MEMBER_ROLES as readonly string[]).includes(r)) {
    return r as BusinessMemberRole;
  }
  return null;
}

/**
 * Request-scoped memoization for layout + settings (same `businessId`, `userId`, `knownOwnerId`).
 */
export const getCachedEffectiveBusinessRole = cache(
  async (
    businessId: string,
    userId: string,
    knownOwnerId?: string | null
  ): Promise<BusinessRole | null> => {
    const { supabase } = await getServerSupabaseUser();
    return getEffectiveBusinessRole(supabase, businessId, userId, {
      knownOwnerId: knownOwnerId ?? undefined,
    });
  }
);

export async function assertBusinessPermission(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  permission: RbacPermission,
  options?: { knownOwnerId?: string | null }
): Promise<{ ok: true; role: BusinessRole } | { ok: false; response: NextResponse }> {
  const role = await getEffectiveBusinessRole(supabase, businessId, userId, options);
  if (!role) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  if (!hasPermission(role, permission)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, role };
}

export async function assertAiInsightsAccess(
  supabase: SupabaseClient,
  businessId: string,
  userId: string
): Promise<{ ok: true; role: BusinessRole } | { ok: false; response: NextResponse }> {
  return assertBusinessPermission(supabase, businessId, userId, AI_INSIGHTS_ACCESS_PERMISSION);
}
