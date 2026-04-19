import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { BusinessMemberRole, BusinessRole, RbacPermission } from '@/lib/rbac/types';
import { BUSINESS_MEMBER_ROLES } from '@/lib/rbac/types';
import { hasPermission } from '@/lib/rbac/permissions';

/** RBAC permission checked server-side for AI Insights APIs (matches dashboard financial visibility). */
export const AI_INSIGHTS_ACCESS_PERMISSION: RbacPermission = 'view_data';

export async function getEffectiveBusinessRole(
  supabase: SupabaseClient,
  businessId: string,
  userId: string
): Promise<BusinessRole | null> {
  const { data: biz } = await supabase
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz) return null;
  if (biz.owner_id === userId) return 'owner';
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

export async function assertBusinessPermission(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  permission: RbacPermission
): Promise<{ ok: true; role: BusinessRole } | { ok: false; response: NextResponse }> {
  const role = await getEffectiveBusinessRole(supabase, businessId, userId);
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
