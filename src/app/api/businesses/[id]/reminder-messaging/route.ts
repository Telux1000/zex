import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import type { Json } from '@/lib/database.types';
import {
  coerceLooseBoolean,
  createDefaultReminderMessagingSettings,
  parseReminderMessaging,
  REMINDER_MESSAGE_PRESETS,
  validateReminderMessaging,
  type ReminderMessagingSettingsV1,
} from '@/lib/invoices/reminder-messaging';

function validateCustomizeRowsOnSave(raw: ReminderMessagingSettingsV1): { ok: true } | { ok: false; error: string } {
  for (const preset of REMINDER_MESSAGE_PRESETS) {
    const row = (raw.presets as Record<string, unknown>)[preset] as Record<string, unknown> | undefined;
    if (row == null) continue;
    const e = coerceLooseBoolean(row.enabled);
    const u = coerceLooseBoolean(row.use_custom_copy);
    const customizeSelected =
      e === true ||
      u === true ||
      (typeof row.enabled === 'boolean' && row.enabled) ||
      (typeof row.use_custom_copy === 'boolean' && row.use_custom_copy);
    if (!customizeSelected) continue;
    const subject = String(row?.subject_template ?? '').trim();
    const message = String(row?.message_template ?? '').trim();
    if (!subject) {
      return { ok: false, error: `Add a subject for “${preset}” or choose “Use default message”.` };
    }
    if (!message) {
      return { ok: false, error: `Add a message for “${preset}” or choose “Use default message”.` };
    }
  }
  return { ok: true };
}

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
  const strict = validateCustomizeRowsOnSave(next);
  if (!strict.ok) {
    return NextResponse.json({ error: strict.error }, { status: 400 });
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
