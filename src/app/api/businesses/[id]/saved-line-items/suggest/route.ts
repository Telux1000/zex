import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { fetchLineItemSuggestions } from '@/lib/saved-line-items/suggest-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId } = await params;
  const perm = await assertBusinessPermission(supabase, businessId, user.id, 'view_data');
  if (!perm.ok) return perm.response;

  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get('q') ?? '');
  const currency = String(searchParams.get('currency') ?? 'USD');
  const limit = Math.min(12, Math.max(1, Number(searchParams.get('limit') || 8) || 8));

  if (!q.trim() || !currency.trim()) {
    return NextResponse.json({ items: [] });
  }

  const items = await fetchLineItemSuggestions(supabase, {
    businessId,
    query: q,
    currency: currency.toUpperCase().slice(0, 3),
    limit,
  });

  return NextResponse.json({ items });
}
