import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const body = await req.json();
  const notificationId = body?.notificationId;
  if (!notificationId) return NextResponse.json({ error: 'Missing notificationId' }, { status: 400 });

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('business_id', business.id)
    .eq('id', notificationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

