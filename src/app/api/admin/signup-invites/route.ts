import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { signupInviteExpiryIso } from '@/lib/auth/signup-control';
import { buildSignupInviteUrl, generateInvitePlainToken, hashInviteToken } from '@/lib/invite-token';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

const createSignupInviteSchema = z
  .object({
    email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
    expires_in_hours: z.number().int().min(1).max(24 * 30).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = createSignupInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const plainToken = generateInvitePlainToken();
  const tokenHash = hashInviteToken(plainToken);
  const expiresHours = parsed.data.expires_in_hours ?? 24 * 7;
  const expiresAt = signupInviteExpiryIso(expiresHours * 60 * 60 * 1000);
  const email = parsed.data.email ? String(parsed.data.email).trim().toLowerCase() : null;

  const { data: inserted, error } = await admin
    .from('signup_invites')
    .insert({
      token_hash: tokenHash,
      email,
      expires_at: expiresAt,
      created_by: gate.user.id,
    })
    .select('id, expires_at')
    .maybeSingle();

  if (error || !inserted?.id) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create signup invite.' }, { status: 500 });
  }

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'admin_signup_invite_created',
    targetType: 'signup_invite',
    targetId: inserted.id,
    metadata: { email, expires_at: inserted.expires_at },
  });

  return NextResponse.json({
    ok: true,
    invite: {
      id: inserted.id,
      token: plainToken,
      invite_url: buildSignupInviteUrl(plainToken),
      expires_at: inserted.expires_at,
      email,
    },
  });
}
