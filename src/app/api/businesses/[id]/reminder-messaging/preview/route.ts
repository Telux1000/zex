import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import {
  buildPostmarkPaymentReminderTemplateModel,
  buildReminderRenderVariables,
  type ReminderMessagePreset,
  parseReminderMessaging,
  type ReminderMessagingSettingsV1,
  resolveOutboundSupportEmail,
} from '@/lib/invoices/reminder-messaging';

export async function POST(
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
  const preset = body?.preset as ReminderMessagePreset;
  if (
    !preset ||
    !['before_due', 'due_today', 'overdue', 'final_reminder'].includes(preset)
  ) {
    return NextResponse.json({ error: 'Invalid preset' }, { status: 400 });
  }
  const draft = body?.messaging as ReminderMessagingSettingsV1 | null | undefined;
  const { data: row } = await supabase
    .from('businesses')
    .select('name, email, reminder_messaging')
    .eq('id', id)
    .single();
  const b = row as { name?: string; email?: string | null; reminder_messaging?: unknown } | null;
  const st = (draft ? draft : b?.reminder_messaging) ?? null;
  const { subject, messagePlain, templateModel } = buildPostmarkPaymentReminderTemplateModel({
    st: st as unknown,
    preset,
    vars: buildReminderRenderVariables({
      customerName: String(body?.sample?.customer_name ?? 'Alex Customer'),
      businessName: String(body?.sample?.business_name ?? b?.name ?? 'Your Business'),
      invoiceNumber: String(body?.sample?.invoice_number ?? 'INV-1001'),
      amount: Number(body?.sample?.amount ?? 1250) || 0,
      currency: String(body?.sample?.currency ?? 'USD'),
      dueDateIso: String(body?.sample?.due_date ?? '2026-05-01'),
      paymentUrl: String(
        body?.sample?.payment_link ?? 'https://app.example.com/pay/sample'
      ),
      supportEmail: String(body?.sample?.support_email ?? resolveOutboundSupportEmail(b?.email)),
    }),
    hasPaymentUrl: true,
    rawAmount: Number(body?.sample?.amount ?? 1250) || 0,
    currencyCode: String(body?.sample?.currency ?? 'USD'),
  });
  return NextResponse.json({
    subject,
    message_plain: messagePlain,
    postmark_model: templateModel,
    effective_messaging: st ? parseReminderMessaging(st) : null,
  });
}
