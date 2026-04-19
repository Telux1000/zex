import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { internalStaffMfaGateOk } from '@/lib/admin/internal-mfa-gate';

export const ADMIN_ROLES = ['owner', 'admin', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? '')
    .trim()
    .toLowerCase();
}

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(normalizeRole(role));
}

export async function getAdminSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, adminRole: null as AdminRole | null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('internal_admin_role, internal_admin_suspended_at')
    .eq('id', user.id)
    .maybeSingle();

  const rawRole = profile?.internal_admin_role ? String(profile.internal_admin_role) : null;
  const adminRole = isAdminRole(rawRole) ? (normalizeRole(rawRole) as AdminRole) : null;
  const suspended = Boolean(profile?.internal_admin_suspended_at);
  return { supabase, user, adminRole, internalAdminSuspended: suspended };
}

export async function requireAdminPageAccess() {
  const session = await getAdminSession();
  if (!session.user) redirect('/login?context=admin&next=%2Fadmin');
  const role = session.adminRole;
  if (!role || session.internalAdminSuspended) redirect('/dashboard?notice=admin-denied');
  if (!(await internalStaffMfaGateOk(session.user.id))) {
    redirect('/dashboard/settings?section=security&notice=admin_mfa_required');
  }
  return { supabase: session.supabase, user: session.user, adminRole: role };
}

export async function requireAdminApiAccess() {
  const session = await getAdminSession();
  if (!session.user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = session.adminRole;
  if (!role || session.internalAdminSuspended) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (!(await internalStaffMfaGateOk(session.user.id))) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Multi-factor authentication is required for internal staff.', code: 'MFA_REQUIRED' },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, supabase: session.supabase, user: session.user, adminRole: role };
}
