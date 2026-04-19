import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const businessId = String(body.business_id ?? '').trim();
    const path = String(body.path ?? '').trim();

    if (!businessId || !path) {
      return NextResponse.json({ error: 'Missing business_id or path' }, { status: 400 });
    }

    if (isHttpUrl(path)) return NextResponse.json({ url: path });

    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_id', user.id)
      .single();
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    const service = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const ttlSeconds = Math.min(
      Math.max(Number(body.ttl_seconds) || 3600, 60),
      60 * 60 * 24
    );
    const { data, error } = await service.storage.from('expense-attachments').createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create signed URL' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
