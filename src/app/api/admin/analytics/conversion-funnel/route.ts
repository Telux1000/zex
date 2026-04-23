import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { computeConversionFunnelAnalytics } from '@/lib/admin/conversion-funnel-analytics';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export async function GET(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  const { supabase, user, adminRole } = gate;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const url = new URL(req.url);
  const startDate = url.searchParams.get('start_date');
  const endDate = url.searchParams.get('end_date');
  const days = Number.parseInt(url.searchParams.get('days') ?? '30', 10);

  try {
    const payload = await computeConversionFunnelAnalytics(admin, {
      startDate,
      endDate,
      days: Number.isFinite(days) ? days : 30,
    });

    await logAdminAuditEvent({
      supabase,
      actorUserId: user.id,
      actorRole: adminRole,
      action: 'admin_view_analytics',
      metadata: {
        card: 'conversion_funnel',
        period_days: payload.period.days,
      },
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load conversion funnel data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
