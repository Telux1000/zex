import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  saveNotificationPreferences,
} from '@/services/notificationPreferences';
import { assertBusinessPermission } from '@/lib/rbac/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const prefs = await getNotificationPreferences(supabase, business.id);
  return NextResponse.json(prefs);
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const gate = await assertBusinessPermission(supabase, business.id, user.id, 'manage_settings');
  if (!gate.ok) return gate.response;

  const body = await req.json();
  const payload = {
    invoice_sent_emails:
      body?.invoice_sent_emails ?? DEFAULT_NOTIFICATION_PREFERENCES.invoice_sent_emails,
    payment_received_alerts:
      body?.payment_received_alerts ?? DEFAULT_NOTIFICATION_PREFERENCES.payment_received_alerts,
    payment_reminders:
      body?.payment_reminders ?? DEFAULT_NOTIFICATION_PREFERENCES.payment_reminders,
    overdue_reminders:
      body?.overdue_reminders ?? DEFAULT_NOTIFICATION_PREFERENCES.overdue_reminders,
    quote_emails: body?.quote_emails ?? DEFAULT_NOTIFICATION_PREFERENCES.quote_emails,
    ai_insight_emails:
      body?.ai_insight_emails ?? DEFAULT_NOTIFICATION_PREFERENCES.ai_insight_emails,
    internal_operational_alerts:
      body?.internal_operational_alerts ??
      DEFAULT_NOTIFICATION_PREFERENCES.internal_operational_alerts,
  };

  await saveNotificationPreferences(supabase, business.id, {
    invoice_sent_emails: Boolean(payload.invoice_sent_emails),
    payment_received_alerts: Boolean(payload.payment_received_alerts),
    payment_reminders: Boolean(payload.payment_reminders),
    overdue_reminders: Boolean(payload.overdue_reminders),
    quote_emails: Boolean(payload.quote_emails),
    ai_insight_emails: Boolean(payload.ai_insight_emails),
    internal_operational_alerts: Boolean(payload.internal_operational_alerts),
  });

  return NextResponse.json({ ok: true });
}

