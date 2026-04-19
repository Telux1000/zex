import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { hashInviteToken } from '@/lib/invite-token';
import { logAdminAuditEventAsService } from '@/lib/admin/audit';
import type { AdminRole } from '@/lib/admin/auth';

type InviteRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  expires_at: string;
  status: string;
  accepted_at: string | null;
  invited_by: string;
  revoked_at: string | null;
};

async function loadInvite(admin: NonNullable<ReturnType<typeof getSupabaseServiceAdmin>>, token: string) {
  const tokenHash = hashInviteToken(token);
  const { data: row, error } = await admin
    .from('internal_staff_invites')
    .select('id, email, full_name, role, expires_at, status, accepted_at, revoked_at, invited_by')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) return { error: error.message, row: null as InviteRow | null };
  if (!row) return { error: null, row: null };
  return { error: null, row: row as InviteRow };
}

async function authUserExists(admin: NonNullable<ReturnType<typeof getSupabaseServiceAdmin>>, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return { exists: false, error: error.message };
  const u = data?.users?.find((x) => (x.email ?? '').toLowerCase() === email.toLowerCase());
  return { exists: Boolean(u?.id), userId: u?.id as string | undefined, error: null as string | null };
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  support: 'Support',
};

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')?.trim() ?? '';
  if (!token) {
    return NextResponse.json({ ok: false, code: 'invalid', error: 'Missing invitation token.' });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, code: 'invalid', error: 'Server misconfigured.' }, { status: 503 });
  }

  const { row, error: loadErr } = await loadInvite(admin, token);
  if (loadErr) {
    return NextResponse.json({ ok: false, code: 'invalid', error: loadErr }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({
      ok: false,
      code: 'invalid',
      error: 'This link has expired or is no longer valid.',
    });
  }

  if (row.status === 'revoked' || row.revoked_at) {
    return NextResponse.json({
      ok: false,
      code: 'revoked',
      error: 'This invitation was revoked.',
    });
  }

  if (row.status === 'accepted' || row.accepted_at) {
    return NextResponse.json({
      ok: false,
      code: 'accepted',
      error: 'This invitation was already accepted.',
    });
  }

  const expiresAtMs = new Date(row.expires_at).getTime();
  const expired = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
  if (expired || row.status === 'expired') {
    if (row.status === 'pending') {
      await admin.from('internal_staff_invites').update({ status: 'expired' }).eq('id', row.id).eq('status', 'pending');
    }
    return NextResponse.json({
      ok: false,
      code: 'expired',
      error: 'This invitation has expired.',
    });
  }

  const { data: invProf } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', row.invited_by)
    .maybeSingle();

  const { exists: hasAccount } = await authUserExists(admin, row.email);

  return NextResponse.json({
    ok: true,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    role_label: ROLE_LABELS[row.role] ?? row.role,
    inviter_name: (invProf?.full_name && String(invProf.full_name).trim()) || 'Zenzex team',
    expires_at: row.expires_at,
    has_account: hasAccount,
  });
}

export async function POST(req: Request) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured.' }, { status: 503 });
  }

  let body: { token?: string; password?: string; full_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const token = body.token != null ? String(body.token).trim() : '';
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing invitation token.' }, { status: 400 });
  }

  const { row, error: loadErr } = await loadInvite(admin, token);
  if (loadErr) {
    return NextResponse.json({ ok: false, error: loadErr }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: 'This link has expired or is no longer valid.' }, { status: 404 });
  }

  if (row.status === 'revoked' || row.revoked_at) {
    return NextResponse.json({ ok: false, error: 'This invitation was revoked.' }, { status: 400 });
  }

  if (row.status === 'accepted' || row.accepted_at) {
    return NextResponse.json({ ok: false, error: 'This invitation was already accepted.' }, { status: 409 });
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await admin.from('internal_staff_invites').update({ status: 'expired' }).eq('id', row.id).eq('status', 'pending');
    return NextResponse.json({ ok: false, error: 'This invitation has expired.' }, { status: 410 });
  }

  if (row.role !== 'admin' && row.role !== 'support') {
    return NextResponse.json({ ok: false, error: 'Invalid role on invitation.' }, { status: 400 });
  }

  const password = body.password != null ? String(body.password) : '';
  const fullNameInput = body.full_name != null ? String(body.full_name).trim() : '';

  if (password.length > 0 || fullNameInput.length > 0) {
    const { exists: hasAccount } = await authUserExists(admin, row.email);
    if (hasAccount) {
      return NextResponse.json(
        {
          ok: false,
          error: 'An account already exists for this email. Sign in to accept the invitation.',
        },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 6 characters.' }, { status: 400 });
    }
    const fullName = fullNameInput || row.full_name;
    if (!fullName) {
      return NextResponse.json({ ok: false, error: 'Full name is required.' }, { status: 400 });
    }

    const { data: created, error: cuErr } = await admin.auth.admin.createUser({
      email: row.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (cuErr || !created.user?.id) {
      const msg = cuErr?.message ?? 'Could not create account.';
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    const userId = created.user.id;

    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        email: row.email,
        full_name: fullName,
        internal_admin_role: row.role,
        internal_admin_invited_by: row.invited_by,
        internal_admin_suspended_at: null,
      },
      { onConflict: 'id' }
    );
    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
    }

    const now = new Date().toISOString();
    const { data: marked } = await admin
      .from('internal_staff_invites')
      .update({
        accepted_at: now,
        status: 'accepted',
        accepted_user_id: userId,
      })
      .eq('id', row.id)
      .is('accepted_at', null)
      .select('id')
      .maybeSingle();

    if (!marked) {
      return NextResponse.json({ ok: false, error: 'Invitation was already processed.' }, { status: 409 });
    }

    await logAdminAuditEventAsService({
      admin,
      actorUserId: userId,
      actorRole: row.role as AdminRole,
      action: 'internal_staff_invite_accepted',
      targetType: 'internal_staff_invite',
      targetId: row.id,
      metadata: { email: row.email },
    });

    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: 'Sign in to accept this invitation.' }, { status: 401 });
  }

  if (user.email.toLowerCase() !== row.email.toLowerCase()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Signed in as a different email than this invitation. Use the invited email.',
      },
      { status: 403 }
    );
  }

  const { data: existingProf } = await admin
    .from('profiles')
    .select('internal_admin_role')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProf?.internal_admin_role && existingProf.internal_admin_role !== row.role) {
    return NextResponse.json({ ok: false, error: 'Your account already has internal access.' }, { status: 409 });
  }

  const { data: curProf } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const mergedName =
    (curProf?.full_name && String(curProf.full_name).trim()) || row.full_name;

  const { error: upErr } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: row.email,
      full_name: mergedName,
      internal_admin_role: row.role,
      internal_admin_invited_by: row.invited_by,
      internal_admin_suspended_at: null,
    },
    { onConflict: 'id' }
  );

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { data: marked } = await admin
    .from('internal_staff_invites')
    .update({
      accepted_at: now,
      status: 'accepted',
      accepted_user_id: user.id,
    })
    .eq('id', row.id)
    .is('accepted_at', null)
    .select('id')
    .maybeSingle();

  if (!marked) {
    return NextResponse.json({ ok: false, error: 'Invitation was already processed.' }, { status: 409 });
  }

  await logAdminAuditEventAsService({
    admin,
    actorUserId: user.id,
    actorRole: row.role as AdminRole,
    action: 'internal_staff_invite_accepted',
    targetType: 'internal_staff_invite',
    targetId: row.id,
    metadata: { email: row.email },
  });

  return NextResponse.json({ ok: true });
}
