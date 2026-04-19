import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { hashInviteToken } from '@/lib/invite-token';
import { BUSINESS_MEMBER_ROLES } from '@/lib/rbac/types';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  staff: 'Staff',
  viewer: 'Viewer',
};

type InviteRow = {
  id: string;
  business_id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  invited_by: string;
};

async function loadInvite(admin: NonNullable<ReturnType<typeof getSupabaseServiceAdmin>>, token: string) {
  const tokenHash = hashInviteToken(token);
  const { data: row, error } = await admin
    .from('business_team_invites')
    .select('id, business_id, email, role, expires_at, accepted_at, invited_by')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) return { error: error.message, row: null as InviteRow | null };
  if (!row) return { error: null, row: null };
  return { error: null, row: row as InviteRow };
}

async function authUserExists(admin: NonNullable<ReturnType<typeof getSupabaseServiceAdmin>>, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return { exists: false, error: error.message };
  const u = data?.users?.find((x) => (x.email ?? '').toLowerCase() === email);
  return { exists: Boolean(u?.id), error: null as string | null };
}

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

  if (row.accepted_at) {
    return NextResponse.json({
      ok: false,
      code: 'accepted',
      error: 'This link has expired or is no longer valid.',
    });
  }

  const expiresAt = new Date(row.expires_at).getTime();
  const expired = Number.isFinite(expiresAt) && expiresAt <= Date.now();
  if (expired) {
    return NextResponse.json({
      ok: false,
      code: 'expired',
      error: 'This link has expired or is no longer valid.',
    });
  }

  const { data: biz } = await admin.from('businesses').select('name').eq('id', row.business_id).maybeSingle();
  const { data: invProf } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', row.invited_by)
    .maybeSingle();

  const { exists: hasAccount, error: authErr } = await authUserExists(admin, row.email);
  if (authErr) {
    return NextResponse.json({ ok: false, code: 'invalid', error: authErr }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    business_name: biz?.name ?? 'Workspace',
    email: row.email,
    role: row.role,
    role_label: ROLE_LABELS[row.role] ?? row.role,
    inviter_name: (invProf?.full_name && String(invProf.full_name).trim()) || 'A teammate',
    expires_at: row.expires_at,
    expired: false,
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

  if (row.accepted_at) {
    return NextResponse.json({ ok: false, error: 'This link has expired or is no longer valid.' }, { status: 409 });
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: 'This link has expired or is no longer valid.' }, { status: 410 });
  }

  if (!(BUSINESS_MEMBER_ROLES as readonly string[]).includes(row.role)) {
    return NextResponse.json({ ok: false, error: 'Invalid role on invitation.' }, { status: 400 });
  }

  const password = body.password != null ? String(body.password) : '';
  const fullName = body.full_name != null ? String(body.full_name).trim() : '';

  if (password.length > 0 || fullName.length > 0) {
    const { exists: hasAccount } = await authUserExists(admin, row.email);
    if (hasAccount) {
      return NextResponse.json(
        { ok: false, error: 'An account already exists for this email. Sign in to accept the invitation.' },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 6 characters.' }, { status: 400 });
    }
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
      },
      { onConflict: 'id' }
    );
    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
    }

    const { error: memErr } = await admin.from('business_members').upsert(
      {
        business_id: row.business_id,
        user_id: userId,
        role: row.role,
      },
      { onConflict: 'business_id,user_id' }
    );
    if (memErr) {
      return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 });
    }

    const now = new Date().toISOString();
    const { data: marked } = await admin
      .from('business_team_invites')
      .update({ accepted_at: now })
      .eq('id', row.id)
      .is('accepted_at', null)
      .select('id')
      .maybeSingle();

    if (!marked) {
      return NextResponse.json({ ok: false, error: 'Invitation was already processed.' }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: 'Sign in to accept this invitation.' }, { status: 401 });
  }

  if (user.email.toLowerCase() !== row.email) {
    return NextResponse.json(
      { ok: false, error: 'Signed in as a different email than this invitation. Use the invited email.' },
      { status: 403 }
    );
  }

  const { data: biz } = await admin.from('businesses').select('owner_id').eq('id', row.business_id).maybeSingle();
  if (biz?.owner_id === user.id) {
    return NextResponse.json({ ok: false, error: 'You are already the owner of this workspace.' }, { status: 400 });
  }

  const { error: memErr } = await admin.from('business_members').upsert(
    {
      business_id: row.business_id,
      user_id: user.id,
      role: row.role,
    },
    { onConflict: 'business_id,user_id' }
  );
  if (memErr) {
    return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { data: marked } = await admin
    .from('business_team_invites')
    .update({ accepted_at: now })
    .eq('id', row.id)
    .is('accepted_at', null)
    .select('id')
    .maybeSingle();

  if (!marked) {
    return NextResponse.json({ ok: false, error: 'Invitation was already processed.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
