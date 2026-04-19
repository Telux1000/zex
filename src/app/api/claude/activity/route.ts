import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateActivityIntelligence } from '@/lib/ai/activity';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const businessId = body.business_id as string | undefined;
    if (!businessId) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_id', user.id)
      .single();
    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    const items = await generateActivityIntelligence(supabase, business.id);
    return NextResponse.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate activity intelligence';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

