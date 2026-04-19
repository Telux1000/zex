import { NextResponse } from 'next/server';
import {
  deriveAccountLifecycleStatus,
  nextAccountStatusAfterAction,
  canManageSubscriberLifecycle,
  type AccountLifecycleAction,
} from '@/lib/admin/account-lifecycle';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  if (!canManageSubscriberLifecycle(gate.adminRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { accountId } = await params;
  const body = (await req.json()) as { action?: AccountLifecycleAction };
  const action = body.action;
  if (action !== 'suspend' && action !== 'reactivate' && action !== 'deactivate') {
    return NextResponse.json({ error: 'action must be suspend, reactivate, or deactivate.' }, { status: 400 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: business, error: bErr } = await admin
    .from('businesses')
    .select('id, name, admin_suspended_at, admin_deactivated_at')
    .eq('id', accountId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!business) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const fromStatus = deriveAccountLifecycleStatus(business);
  const toStatus = nextAccountStatusAfterAction(fromStatus, action);
  if (!toStatus) {
    return NextResponse.json({ error: 'Invalid transition for current account state.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch =
    action === 'suspend'
      ? { admin_suspended_at: now, admin_deactivated_at: null as string | null }
      : action === 'deactivate'
        ? { admin_deactivated_at: now, admin_suspended_at: null as string | null }
        : { admin_suspended_at: null as string | null, admin_deactivated_at: null as string | null };

  const { error: uErr } = await admin.from('businesses').update(patch).eq('id', accountId);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  const auditAction =
    action === 'suspend'
      ? ('admin_account_suspended' as const)
      : action === 'deactivate'
        ? ('admin_account_deactivated' as const)
        : ('admin_account_reactivated' as const);

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: auditAction,
    targetType: 'subscriber_account',
    targetId: accountId,
    metadata: {
      from: fromStatus,
      to: toStatus,
      accountName: business.name ?? null,
    },
  });

  return NextResponse.json({ ok: true, status: toStatus });
}
