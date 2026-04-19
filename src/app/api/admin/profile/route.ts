import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

const FULL_NAME_MAX = 200;

/** Current internal admin identity (B-code, role) for Profile and header. */
export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: prof, error: pErr } = await admin
    .from('profiles')
    .select(
      'full_name, email, avatar_url, internal_admin_role, internal_staff_code, internal_admin_suspended_at, created_at, internal_support_ticket_sound'
    )
    .eq('id', gate.user.id)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: auth } = await admin.auth.admin.getUserById(gate.user.id);

  return NextResponse.json({
    user_id: gate.user.id,
    display_name: prof?.full_name?.trim() || null,
    email: prof?.email ?? gate.user.email ?? null,
    avatar_url: prof?.avatar_url ? String(prof.avatar_url).trim() || null : null,
    internal_code: prof?.internal_staff_code ? String(prof.internal_staff_code) : null,
    role: prof?.internal_admin_role ? String(prof.internal_admin_role).toLowerCase() : null,
    status: prof?.internal_admin_suspended_at ? 'suspended' : 'active',
    created_at: prof?.created_at ?? null,
    last_active_at: auth?.user?.last_sign_in_at ?? null,
    internal_support_ticket_sound: prof?.internal_support_ticket_sound !== false,
  });
}

/** Update own profile: `full_name` and/or `internal_support_ticket_sound`. Audited when name changes. */
export async function PATCH(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  let body: { full_name?: unknown; internal_support_ticket_sound?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const hasSound = body.internal_support_ticket_sound !== undefined;
  const hasName = body.full_name !== undefined && body.full_name !== null;

  if (!hasName && !hasSound) {
    return NextResponse.json({ error: 'No valid fields.' }, { status: 400 });
  }

  let nextSound: boolean | null = null;
  if (hasSound) {
    nextSound = Boolean(body.internal_support_ticket_sound);
  }

  let fullName: string | null = null;
  if (hasName) {
    fullName = String(body.full_name).trim();
    if (!fullName) {
      return NextResponse.json({ error: 'Full name cannot be empty.' }, { status: 400 });
    }
    if (fullName.length > FULL_NAME_MAX) {
      return NextResponse.json({ error: `Full name must be at most ${FULL_NAME_MAX} characters.` }, { status: 400 });
    }
  }

  const { data: before, error: fetchErr } = await gate.supabase
    .from('profiles')
    .select('full_name, internal_staff_code, internal_support_ticket_sound')
    .eq('id', gate.user.id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const oldName = (before?.full_name && String(before.full_name).trim()) || '';
  const patch: Record<string, unknown> = {};
  let nameChanged = false;

  if (fullName != null && oldName !== fullName) {
    patch.full_name = fullName;
    nameChanged = true;
  }

  if (nextSound != null) {
    const prev = before?.internal_support_ticket_sound !== false;
    if (prev !== nextSound) {
      patch.internal_support_ticket_sound = nextSound;
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error: upErr } = await gate.supabase.from('profiles').update(patch).eq('id', gate.user.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  if (nameChanged && fullName != null) {
    const updatedAt = new Date().toISOString();
    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: 'internal_staff_profile_name_updated',
      targetType: 'internal_staff_profile',
      targetId: gate.user.id,
      metadata: {
        oldFullName: oldName || null,
        newFullName: fullName,
        updatedAt,
        targetStaffCode: before?.internal_staff_code
          ? String(before.internal_staff_code).trim() || null
          : null,
      },
    });
  }

  const response: Record<string, unknown> = { ok: true };
  if (fullName != null) {
    response.display_name = fullName;
    response.unchanged = !nameChanged;
  }
  if (nextSound != null) {
    response.internal_support_ticket_sound = nextSound;
  }

  return NextResponse.json(response);
}
