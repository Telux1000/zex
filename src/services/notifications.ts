import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, sendTemplatedEmail, resolvePostmarkTemplateFromEnv } from '@/services/postmark';
import { getNotificationPreferences } from '@/services/notificationPreferences';
import type { InAppNotificationInput, NotificationEventType } from '@/types/notifications';

type NotifyEventPayload = {
  businessId: string;
  eventType: NotificationEventType;
  title: string;
  message: string;
  entityType?: 'invoice' | 'quote' | 'customer' | 'expense' | 'payment' | 'system';
  entityId?: string | null;
  severity?: 'success' | 'info' | 'warning' | 'danger';
  actionLabel?: string | null;
  actionTarget?: string | null;
  groupKey?: string;
  metadata?: Record<string, unknown>;
  email?: {
    to: string | null | undefined;
    subject: string;
    htmlBody?: string;
    textBody?: string;
    templateEnvKey?: string;
    templateModel?: Record<string, unknown>;
    tag?: string;
    attachments?: Array<{
      Name: string;
      Content: string;
      ContentType: string;
    }>;
  } | null;
  internalEmail?: {
    subject: string;
    htmlBody?: string;
    textBody?: string;
    templateEnvKey?: string;
    templateModel?: Record<string, unknown>;
    tag?: string;
    attachments?: Array<{
      Name: string;
      Content: string;
      ContentType: string;
    }>;
  } | null;
};

const EVENT_CHANNEL_RULES: Record<NotificationEventType, { inApp: boolean; emailPref?: keyof Awaited<ReturnType<typeof getNotificationPreferences>> }> = {
  invoice_created: { inApp: false },
  invoice_sent: { inApp: false, emailPref: 'invoice_sent_emails' },
  invoice_paid: { inApp: true, emailPref: 'payment_received_alerts' },
  invoice_overdue: { inApp: true, emailPref: 'overdue_reminders' },
  payment_received: { inApp: true, emailPref: 'payment_received_alerts' },
  customer_created: { inApp: false },
  quote_created: { inApp: false },
  quote_sent: { inApp: false, emailPref: 'quote_emails' },
  quote_accepted: { inApp: true, emailPref: 'internal_operational_alerts' },
  quote_rejected: { inApp: true, emailPref: 'internal_operational_alerts' },
  quote_converted: { inApp: true, emailPref: 'internal_operational_alerts' },
  expense_created: { inApp: false },
  high_expense_created: { inApp: true, emailPref: 'internal_operational_alerts' },
  ai_cashflow_warning: { inApp: true, emailPref: 'ai_insight_emails' },
  stale_quote_followup: { inApp: true, emailPref: 'internal_operational_alerts' },
  accepted_quote_ready_for_invoice: { inApp: true, emailPref: 'internal_operational_alerts' },
  payment_reminder_upcoming: { inApp: false, emailPref: 'payment_reminders' },
  invoice_overdue_reminder: { inApp: true, emailPref: 'overdue_reminders' },
};

function mapSeverityToNotification(severity?: string) {
  const s = String(severity ?? 'info').toLowerCase();
  if (s === 'danger') return { category: 'urgent', severity: 'high', priority: 960 };
  if (s === 'warning') return { category: 'action_needed', severity: 'medium', priority: 760 };
  if (s === 'success') return { category: 'info', severity: 'low', priority: 360 };
  return { category: 'info', severity: 'low', priority: 300 };
}

async function createInAppNotification(supabase: SupabaseClient, input: InAppNotificationInput) {
  const mapped = mapSeverityToNotification(input.severity);
  const groupKey = input.groupKey ?? `${input.type}:${input.entityType ?? 'system'}:${input.entityId ?? 'none'}`;

  const payload = {
    business_id: input.businessId,
    type: input.type,
    channel: 'in_app',
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    category: mapped.category,
    title: input.title,
    description: input.message,
    severity: mapped.severity,
    priority_score: mapped.priority,
    action_label: input.actionLabel ?? null,
    action_target: input.actionTarget ?? null,
    group_key: groupKey,
    metadata: {
      ...(input.metadata ?? {}),
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      channel: 'in_app',
    },
  };

  const { error } = await supabase
    .from('notifications')
    .upsert(payload, { onConflict: 'business_id,group_key,type' });
  if (error) throw new Error(error.message);
}

async function recordEmailMessage(
  supabase: SupabaseClient,
  input: {
    businessId: string;
    relatedEntityType?: string;
    relatedEntityId?: string | null;
    eventType: NotificationEventType;
    to: string;
    subject: string;
    postmarkMessageId?: string | null;
    status: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from('email_messages').insert({
    business_id: input.businessId,
    related_entity_type: input.relatedEntityType ?? null,
    related_entity_id: input.relatedEntityId ?? null,
    event_type: input.eventType,
    recipient_to: input.to,
    subject: input.subject,
    postmark_message_id: input.postmarkMessageId ?? null,
    status: input.status,
    sent_at: input.status === 'sent' ? new Date().toISOString() : null,
    metadata: input.metadata ?? {},
  });
}

async function resolveInternalRecipientEmail(supabase: SupabaseClient, businessId: string) {
  const { data: biz } = await supabase
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .maybeSingle();
  const ownerId = (biz as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', ownerId)
    .maybeSingle();
  const email = (profile as { email?: string | null } | null)?.email ?? null;
  return email && String(email).trim() ? String(email).trim() : null;
}

const SIMPLE_EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function hasHeaderInjection(value: string): boolean {
  return /[\r\n]/.test(value);
}

function normalizeEmailAddress(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || hasHeaderInjection(trimmed)) return null;
  const match = trimmed.match(/<([^>]+)>/);
  const email = (match?.[1] ?? trimmed).trim();
  if (!email || hasHeaderInjection(email)) return null;
  return SIMPLE_EMAIL_RE.test(email) ? email : null;
}

function sanitizeDisplayName(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[\r\n"]/g, ' ')
    .trim()
    .slice(0, 200);
}

function formatReplyTo(displayName: string, email: string): string {
  return displayName ? `"${displayName}" <${email}>` : email;
}

/** Customer-facing mail: display business name on From; Reply-To uses business email when set. */
async function getBusinessOutboundEmailIdentity(supabase: SupabaseClient, businessId: string) {
  const { data } = await supabase
    .from('businesses')
    .select('name, email, owner_id')
    .eq('id', businessId)
    .maybeSingle();
  const row = data as { name?: string | null; email?: string | null; owner_id?: string | null } | null;
  const businessName = String(row?.name ?? '').trim();
  const businessEmail = normalizeEmailAddress(row?.email ?? null);
  const ownerId = String(row?.owner_id ?? '').trim();

  const verifiedFrom = process.env.POSTMARK_FROM_EMAIL?.trim();
  const displayName = businessName.replace(/[\r\n"]/g, ' ').trim().slice(0, 200);
  let from: string | undefined;
  if (verifiedFrom) {
    const addrMatch = verifiedFrom.match(/<([^>]+)>/);
    const addr = (addrMatch?.[1] ?? verifiedFrom).trim();
    if (displayName) {
      from = `"${displayName.replace(/"/g, '')}" <${addr}>`;
    } else {
      from = verifiedFrom;
    }
  }

  let ownerEmail: string | null = null;
  if (ownerId) {
    const { data: owner } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', ownerId)
      .maybeSingle();
    ownerEmail = normalizeEmailAddress((owner as { email?: string | null } | null)?.email ?? null);
  }

  const supportEmail =
    normalizeEmailAddress(process.env.SUPPORT_EMAIL) ??
    normalizeEmailAddress(process.env.POSTMARK_REPLY_TO) ??
    normalizeEmailAddress(process.env.POSTMARK_FROM_EMAIL) ??
    null;

  const replyEmail = businessEmail ?? ownerEmail ?? supportEmail;
  const replyTo =
    replyEmail == null
      ? undefined
      : businessEmail || ownerEmail
        ? formatReplyTo(sanitizeDisplayName(businessName), replyEmail)
        : replyEmail;
  const replyToSource =
    businessEmail != null ? 'business_email' : ownerEmail != null ? 'owner_email' : supportEmail != null ? 'support_fallback' : 'none';

  return { from, replyTo, replyToSource };
}

export type NotifyBusinessEventResult = {
  /** Outbound customer email (payload.email) — Postmark send outcome when attempted. */
  outboundCustomerEmail?: { attempted: boolean; ok: boolean; error?: string | null };
};

export async function notifyBusinessEvent(
  supabase: SupabaseClient,
  payload: NotifyEventPayload
): Promise<NotifyBusinessEventResult> {
  const rules = EVENT_CHANNEL_RULES[payload.eventType];
  if (!rules) return {};

  const prefs = await getNotificationPreferences(supabase, payload.businessId);

  if (rules.inApp) {
    await createInAppNotification(supabase, {
      businessId: payload.businessId,
      type: payload.eventType,
      title: payload.title,
      message: payload.message,
      entityType: payload.entityType,
      entityId: payload.entityId ?? null,
      severity: payload.severity,
      actionLabel: payload.actionLabel,
      actionTarget: payload.actionTarget,
      groupKey: payload.groupKey,
      metadata: payload.metadata,
    });
  }

  const prefEnabled = rules.emailPref ? Boolean(prefs[rules.emailPref]) : false;
  const metaSource =
    payload.metadata && typeof (payload.metadata as { source?: unknown }).source !== 'undefined'
      ? String((payload.metadata as { source?: unknown }).source)
      : '';
  const postmarkMetaBase: Record<string, string> = {
    event_type: payload.eventType,
    business_id: payload.businessId,
    entity_id: payload.entityId ?? '',
    ...(metaSource ? { source: metaSource } : {}),
  };

  if (!prefEnabled) {
    return {
      outboundCustomerEmail: payload.email?.to
        ? { attempted: false, ok: true, error: 'email_preference_disabled' }
        : undefined,
    };
  }

  let outboundCustomerEmail: NotifyBusinessEventResult['outboundCustomerEmail'];

  if (payload.email?.to) {
    const outbound = await getBusinessOutboundEmailIdentity(supabase, payload.businessId);
    console.log('[postmark-outbound] reply-to resolved', {
      eventType: payload.eventType,
      businessId: payload.businessId,
      tag: payload.email.tag ?? payload.eventType,
      replyToSet: Boolean(outbound.replyTo),
      replyToSource: outbound.replyToSource,
    });
    const template = resolvePostmarkTemplateFromEnv(payload.email.templateEnvKey);
    if (payload.email.tag === 'invoice_payment_reminder' || payload.email.tag === 'invoice_overdue') {
      const hasTpl = Boolean(template.templateId || template.templateAlias);
      const m = (payload.email.templateModel ?? {}) as Record<string, unknown>;
      console.log('[postmark-outbound] payment reminder', {
        to: payload.email.to,
        tag: payload.email.tag,
        hasTemplate: hasTpl,
        templateEnvKey: payload.email.templateEnvKey,
        templateId: template.templateId,
        templateAlias: template.templateAlias,
        hasSubject: typeof m.subject === 'string' && String(m.subject).length > 0,
        hasReminderMessage: typeof m.reminder_message === 'string' && String(m.reminder_message).length > 0,
        eventType: payload.eventType,
        ...postmarkMetaBase,
      });
      if (!hasTpl) {
        console.warn(
          '[postmark-outbound] POSTMARK template env not set; using raw sendEmail. Set POSTMARK_TEMPLATE_PAYMENT_REMINDER for the branded template with {{subject}} and {{{reminder_message}}}.'
        );
      }
    }
    const result =
      template.templateId || template.templateAlias
        ? await sendTemplatedEmail({
            to: payload.email.to,
            from: outbound.from,
            replyTo: outbound.replyTo,
            templateId: template.templateId,
            templateAlias: template.templateAlias,
            templateModel: payload.email.templateModel ?? {},
            tag: payload.email.tag ?? payload.eventType,
            attachments: payload.email.attachments,
            metadata: postmarkMetaBase,
          })
        : await sendEmail({
            to: payload.email.to,
            from: outbound.from,
            replyTo: outbound.replyTo,
            subject: payload.email.subject,
            htmlBody: payload.email.htmlBody,
            textBody: payload.email.textBody,
            tag: payload.email.tag ?? payload.eventType,
            attachments: payload.email.attachments,
            metadata: postmarkMetaBase,
          });

    outboundCustomerEmail = { attempted: true, ok: result.ok, error: result.error ?? null };

    await recordEmailMessage(supabase, {
      businessId: payload.businessId,
      relatedEntityType: payload.entityType,
      relatedEntityId: payload.entityId ?? null,
      eventType: payload.eventType,
      to: payload.email.to,
      subject: payload.email.subject,
      postmarkMessageId: result.messageId ?? null,
      status: result.status,
      metadata: {
        provider: 'postmark',
        error: result.error ?? null,
        ...(metaSource ? { source: metaSource } : {}),
      },
    });
  }

  if (payload.internalEmail) {
    const internalTo = await resolveInternalRecipientEmail(supabase, payload.businessId);
    if (!internalTo) return { outboundCustomerEmail };
    const template = resolvePostmarkTemplateFromEnv(payload.internalEmail.templateEnvKey);
    const result =
      template.templateId || template.templateAlias
        ? await sendTemplatedEmail({
            to: internalTo,
            templateId: template.templateId,
            templateAlias: template.templateAlias,
            templateModel: payload.internalEmail.templateModel ?? {},
            tag: payload.internalEmail.tag ?? payload.eventType,
            attachments: payload.internalEmail.attachments,
            metadata: {
              event_type: payload.eventType,
              business_id: payload.businessId,
              entity_id: payload.entityId ?? '',
              recipient_type: 'internal',
            },
          })
        : await sendEmail({
            to: internalTo,
            subject: payload.internalEmail.subject,
            htmlBody: payload.internalEmail.htmlBody,
            textBody: payload.internalEmail.textBody,
            tag: payload.internalEmail.tag ?? payload.eventType,
            attachments: payload.internalEmail.attachments,
            metadata: {
              event_type: payload.eventType,
              business_id: payload.businessId,
              entity_id: payload.entityId ?? '',
              recipient_type: 'internal',
            },
          });

    await recordEmailMessage(supabase, {
      businessId: payload.businessId,
      relatedEntityType: payload.entityType,
      relatedEntityId: payload.entityId ?? null,
      eventType: payload.eventType,
      to: internalTo,
      subject: payload.internalEmail.subject,
      postmarkMessageId: result.messageId ?? null,
      status: result.status,
      metadata: {
        provider: 'postmark',
        recipient_type: 'internal',
        error: result.error ?? null,
        ...(metaSource ? { source: metaSource } : {}),
      },
    });
  }

  return { outboundCustomerEmail };
}

export async function updateEmailMessageStatusFromWebhook(
  supabase: SupabaseClient,
  input: {
    postmarkMessageId?: string | null;
    status: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'spam_complaint';
    timestampIso: string;
    webhookPayload?: Record<string, unknown>;
  }
) {
  const messageId = input.postmarkMessageId ? String(input.postmarkMessageId).trim() : '';
  if (!messageId) return;

  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.status === 'delivered') patch.delivered_at = input.timestampIso;
  if (input.status === 'opened') patch.opened_at = input.timestampIso;
  if (input.status === 'clicked') patch.clicked_at = input.timestampIso;
  if (input.status === 'bounced') patch.bounced_at = input.timestampIso;
  if (input.status === 'spam_complaint') patch.complained_at = input.timestampIso;
  if (input.webhookPayload) patch.metadata = { webhook: input.webhookPayload };

  await supabase
    .from('email_messages')
    .update(patch)
    .eq('postmark_message_id', messageId);
}

