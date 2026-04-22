import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  evaluateSystemAccess,
  fetchAppSystemSettings,
  getSystemModeMessage,
  isInternalAdminRoleValue,
  type SystemMode,
} from '@/lib/system-access';

type LoginContextResponse = {
  login_allowed: boolean;
  system_mode: SystemMode;
  system_message: string | null;
  code: 'OK' | 'EMERGENCY_LOCKDOWN';
};

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
  }

  const settings = await fetchAppSystemSettings(admin);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isInternalAdmin = false;
  if (user?.id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('internal_admin_role, internal_admin_suspended_at')
      .eq('id', user.id)
      .maybeSingle();
    isInternalAdmin =
      isInternalAdminRoleValue(profile?.internal_admin_role) && !Boolean(profile?.internal_admin_suspended_at);
  }

  const decision = evaluateSystemAccess({
    settings,
    action: 'login',
    isAdmin: isInternalAdmin,
  });
  const message = getSystemModeMessage(settings.system_mode, settings.system_message);
  const payload: LoginContextResponse = {
    login_allowed: decision.allowed,
    system_mode: settings.system_mode,
    system_message: message,
    code: decision.allowed ? 'OK' : 'EMERGENCY_LOCKDOWN',
  };
  if (!decision.allowed) {
    return NextResponse.json(payload, { status: 423 });
  }
  return NextResponse.json(payload);
}
