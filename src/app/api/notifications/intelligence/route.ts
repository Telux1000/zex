import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { runNotificationIntelligenceForBusiness } from '@/lib/notifications/notification-runner';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { notifications, unreadActionableCount } = await runNotificationIntelligenceForBusiness({
    supabase,
    businessId: business.id,
    baseCurrencyCode: business.currency ?? 'USD',
    nowIso,
  });

  return NextResponse.json({
    notifications,
    unreadActionableCount,
    generatedAt: nowIso,
  });
}

