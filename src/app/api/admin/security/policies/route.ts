import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  internalSecurityPolicyPatchSchema,
  persistInternalSecurityPolicyPatch,
} from '@/lib/admin/internal-security-policy-persist';

export async function PATCH(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  if (gate.adminRole !== 'owner') {
    return NextResponse.json({ error: 'Only owners can change security policies.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = internalSecurityPolicyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const result = await persistInternalSecurityPolicyPatch({
    admin,
    gate: { user: gate.user, supabase: gate.supabase, adminRole: gate.adminRole },
    patch: parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ policies: result.policies });
}
