import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import type { Json } from '@/lib/database.types';
import {
  createDefaultReminderMessagingSettings,
  parseReminderMessaging,
  validateReminderMessaging,
  type ReminderMessagingSettingsV1,
} from '@/lib/invoices/reminder-messaging';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const gate = await assertBusinessPermission(supabase, id, user.id, 'manage_settings');
  if (!gate.ok) return gate.response;
  const { data: row, error } = await supabase
    .from('businesses')
    .select('reminder_messaging')
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const raw = (row as { reminder_messaging?: unknown | null }).reminder_messaging;
  const effective = parseReminderMessaging(raw);
  return NextResponse.json({
    messaging: effective,
    platform_defaults: createDefaultReminderMessagingSettings(),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const gate = await assertBusinessPermission(supabase, id, user.id, 'manage_settings');
  if (!gate.ok) return gate.response;
  const body = await req.json();
  const next = body?.messaging as ReminderMessagingSettingsV1;
  if (!next || next.version !== 1 || !next.presets) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const v = validateReminderMessaging(next);
  if (!v.ok) {
    return NextResponse.json({ error: v.error, field: v.field }, { status: 400 });
  }
  const now = new Date().toISOString();
  const withTs: ReminderMessagingSettingsV1 = {
    version: 1,
    presets: {
      before_due: { ...next.presets.before_due, updated_at: now },
      due_today: { ...next.presets.due_today, updated_at: now },
      overdue: { ...next.presets.overdue, updated_at: now },
      final_reminder: { ...next.presets.final_reminder, updated_at: now },
    },
  };
  const { data, error } = await supabase
    .from('businesses')
    .update({ reminder_messaging: withTs as unknown as Json })
    .eq('id', id)
    .select('reminder_messaging')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    messaging: parseReminderMessaging(
      (data as { reminder_messaging?: unknown | null }).reminder_messaging
    ),
  });
}
