import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { fetchLineItemAutocompleteIndex } from '@/lib/saved-line-items/suggest-server';

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
  const currency = String(searchParams.get('currency') ?? 'USD')
    .toUpperCase()
    .slice(0, 3);
  if (!currency.trim()) {
    return NextResponse.json({ items: [] as unknown[] });
  }

  const items = await fetchLineItemAutocompleteIndex(supabase, {
    businessId,
    currency,
  });
  return NextResponse.json({ items });
}
