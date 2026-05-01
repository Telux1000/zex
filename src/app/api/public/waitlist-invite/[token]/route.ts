import { NextResponse } from 'next/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { fetchWaitlistInvitePreview } from '@/lib/waitlist/waitlist-invite';

export const dynamic = 'force-dynamic';

/** Public: validate waitlist invite token (no email returned until token valid). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = decodeURIComponent(String(token ?? '').trim());
  if (!t || t.length > 512) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const preview = await fetchWaitlistInvitePreview(admin, t);
  if (!preview.ok) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json({ ok: true, email: preview.email });
}
