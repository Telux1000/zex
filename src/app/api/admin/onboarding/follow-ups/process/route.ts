import { NextResponse } from 'next/server';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { runOnboardingFollowUpProcessor } from '@/lib/admin/onboarding-follow-ups';

export async function POST(req: Request) {
  const secret = process.env.ONBOARDING_FOLLOW_UPS_CRON_SECRET?.trim();
  const auth = req.headers.get('authorization');
  const cronAuthorized = Boolean(secret && auth === `Bearer ${secret}`);

  if (!cronAuthorized) {
    const gate = await requireAdminApiAccess();
    if (!gate.ok) return gate.response;
    const result = await runOnboardingFollowUpProcessor();
    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: 'admin_view_accounts',
      metadata: {
        operation: 'run_onboarding_follow_up_processor',
        reconciled: result.reconciled,
        sent: result.sent,
        canceled: result.canceled,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const result = await runOnboardingFollowUpProcessor();
  return NextResponse.json({ ok: true, ...result });
}
