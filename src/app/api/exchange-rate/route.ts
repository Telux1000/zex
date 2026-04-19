import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = (searchParams.get('from') ?? '').trim();
  const to = (searchParams.get('to') ?? '').trim();
  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from and to currency codes' }, { status: 400 });
  }

  try {
    const rate = await resolveExchangeRateToBase(from, to, null);
    return NextResponse.json({ from: from.toUpperCase(), to: to.toUpperCase(), rate });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'FX error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
