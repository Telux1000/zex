import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { computeWaitlistPriorityScore } from '@/lib/waitlist/waitlist-priority';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['pending', 'invited', 'activated', 'converted']);

export async function GET(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status')?.trim().toLowerCase();
  const country = url.searchParams.get('country')?.trim();
  const businessType = url.searchParams.get('business_type')?.trim();
  const source = url.searchParams.get('source')?.trim();

  let q = admin.from('waitlist').select('*');
  if (status && STATUSES.has(status)) {
    q = q.eq('status', status);
  }
  if (country) {
    q = q.ilike('country', `%${country.replace(/%/g, '')}%`);
  }
  if (businessType) {
    q = q.ilike('business_type', `%${businessType.replace(/%/g, '')}%`);
  }
  if (source) {
    q = q.eq('source', source.slice(0, 64));
  }

  const { data: rows, error } = await q.order('created_at', { ascending: false }).limit(2000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [totalRes, invitedRes, activatedRes, convertedRes] = await Promise.all([
    admin.from('waitlist').select('id', { count: 'exact', head: true }),
    admin.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'invited'),
    admin.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'activated'),
    admin.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'converted'),
  ]);

  const total = totalRes.count ?? 0;
  const invited = invitedRes.count ?? 0;
  const activated = activatedRes.count ?? 0;
  const converted = convertedRes.count ?? 0;
  const conversion_rate_pct = total > 0 ? Math.round((converted / total) * 1000) / 10 : 0;

  const mapped = (rows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const { invite_token_hash: _omit, ...safe } = row;
    const email = String(safe.email ?? '');
    const priority_score = computeWaitlistPriorityScore({
      email,
      referral_count: Number(safe.referral_count ?? 0),
      source: String(safe.source ?? ''),
      trigger_reason: safe.trigger_reason != null ? String(safe.trigger_reason) : null,
      country: safe.country != null ? String(safe.country) : null,
    });
    return { ...safe, priority_score };
  });
  mapped.sort((a, b) => {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const ps = Number(rb.priority_score) - Number(ra.priority_score);
    if (ps !== 0) return ps;
    return String(rb.created_at ?? '').localeCompare(String(ra.created_at ?? ''));
  });

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'admin_view_waitlist',
    metadata: { count: mapped.length, filters: { status, country, businessType, source } },
  });

  return NextResponse.json({
    rows: mapped,
    metrics: {
      total,
      invited,
      activated,
      converted,
      conversion_rate_pct,
    },
  });
}
