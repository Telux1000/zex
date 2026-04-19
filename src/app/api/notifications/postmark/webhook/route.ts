import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { updateEmailMessageStatusFromWebhook } from '@/services/notifications';

function webhookAuthorized(req: Request) {
  const expected = process.env.POSTMARK_WEBHOOK_SECRET;
  if (!expected) return true;
  const provided =
    req.headers.get('x-postmark-webhook-token') ||
    req.headers.get('authorization') ||
    '';
  return provided === expected || provided === `Bearer ${expected}`;
}

function pickTimestamp(payload: Record<string, unknown>) {
  const keys = ['DeliveredAt', 'ReceivedAt', 'BouncedAt', 'RecordType', 'MessageStream'];
  for (const k of keys) {
    const raw = payload[k];
    if (typeof raw === 'string') {
      const t = new Date(raw).getTime();
      if (Number.isFinite(t)) return new Date(t).toISOString();
    }
  }
  return new Date().toISOString();
}

export async function POST(req: Request) {
  if (!webhookAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const body = (await req.json()) as Record<string, unknown>;
  const messageId =
    (typeof body.MessageID === 'string' && body.MessageID) ||
    (typeof body.OriginalMessageID === 'string' && body.OriginalMessageID) ||
    null;

  const url = new URL(req.url);
  const event = url.searchParams.get('event') ?? 'delivery';

  const map: Record<string, 'delivered' | 'opened' | 'clicked' | 'bounced' | 'spam_complaint'> = {
    delivery: 'delivered',
    bounce: 'bounced',
    open: 'opened',
    click: 'clicked',
    spam: 'spam_complaint',
    complaint: 'spam_complaint',
  };
  const status = map[event] ?? 'delivered';

  await updateEmailMessageStatusFromWebhook(supabase, {
    postmarkMessageId: messageId,
    status,
    timestampIso: pickTimestamp(body),
    webhookPayload: body,
  });

  return NextResponse.json({ ok: true });
}

