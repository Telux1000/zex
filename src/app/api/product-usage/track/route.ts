import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedFeatureKey, isAllowedPageSectionKey } from '@/lib/product-usage/allowed-keys';

type Body = {
  kind?: string;
  target_key?: string;
  business_id?: string;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const kind = String(body.kind ?? '').trim();
  const targetKey = String(body.target_key ?? '').trim();
  const businessId = String(body.business_id ?? '').trim();

  if (kind !== 'page_view' && kind !== 'feature_use') {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }
  if (!businessId) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
  }

  if (kind === 'page_view' && !isAllowedPageSectionKey(targetKey)) {
    return NextResponse.json({ error: 'Invalid target_key for page_view' }, { status: 400 });
  }
  if (kind === 'feature_use' && !isAllowedFeatureKey(targetKey)) {
    return NextResponse.json({ error: 'Invalid target_key for feature_use' }, { status: 400 });
  }

  const { error } = await supabase.from('product_usage_events').insert({
    user_id: user.id,
    business_id: businessId,
    kind,
    target_key: targetKey,
  });

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ ok: false, skipped: true, reason: 'table_missing' });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
