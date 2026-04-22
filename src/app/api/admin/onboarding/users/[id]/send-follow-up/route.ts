import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { sendManualOnboardingFollowUp } from '@/lib/admin/onboarding-follow-ups';
import { type AccountOnboardingStage } from '@/lib/admin/account-onboarding';

type Body = {
  template_id?: string;
  onboarding_stage?: AccountOnboardingStage;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  const { supabase, user, adminRole } = gate;
  const params = await ctx.params;
  const userId = String(params.id ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const templateId = String(body.template_id ?? '').trim();
  const stage = body.onboarding_stage;
  if (!templateId || !stage) {
    return NextResponse.json({ error: 'template_id and onboarding_stage are required' }, { status: 400 });
  }
  const result = await sendManualOnboardingFollowUp({
    userId,
    templateId,
    stage,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_accounts',
    targetType: 'onboarding_follow_up',
    targetId: userId,
    metadata: { operation: 'manual_send_follow_up', template_id: templateId, onboarding_stage: stage },
  });

  return NextResponse.json({ ok: true });
}
