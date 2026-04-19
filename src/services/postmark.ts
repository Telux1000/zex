import { randomUUID } from 'crypto';

type SendEmailOptions = {
  to: string;
  cc?: string;
  bcc?: string;
  from?: string;
  replyTo?: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  tag?: string;
  metadata?: Record<string, string>;
  messageStream?: string;
  attachments?: Array<{
    Name: string;
    Content: string;
    ContentType: string;
  }>;
};

type SendTemplatedEmailOptions = {
  to: string;
  cc?: string;
  bcc?: string;
  from?: string;
  replyTo?: string;
  templateId?: number;
  templateAlias?: string;
  templateModel: Record<string, unknown>;
  tag?: string;
  metadata?: Record<string, string>;
  messageStream?: string;
  attachments?: Array<{
    Name: string;
    Content: string;
    ContentType: string;
  }>;
};

type PostmarkResponse = {
  MessageID?: string;
  ErrorCode?: number;
  Message?: string;
  To?: string;
  SubmittedAt?: string;
};

function getPostmarkConfig() {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM_EMAIL;
  const replyTo = process.env.POSTMARK_REPLY_TO;
  const messageStream = process.env.POSTMARK_MESSAGE_STREAM_OUTBOUND;
  return { token, from, replyTo, messageStream };
}

/** Resolve Postmark TemplateId (numeric) or TemplateAlias from an env var name, e.g. POSTMARK_TEMPLATE_USER_INVITATION */
export function resolvePostmarkTemplateFromEnv(envKey?: string) {
  if (!envKey) return { templateId: undefined as number | undefined, templateAlias: undefined as string | undefined };
  const raw = process.env[envKey]?.trim();
  if (!raw) return { templateId: undefined as number | undefined, templateAlias: undefined as string | undefined };
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) return { templateId: asNum, templateAlias: undefined };
  return { templateId: undefined, templateAlias: raw };
}

function asRecord(input?: Record<string, string>): Record<string, string> {
  return input ? { ...input } : {};
}

async function callPostmark(path: string, payload: Record<string, unknown>) {
  const { token } = getPostmarkConfig();
  if (!token) {
    return {
      ok: false,
      messageId: null as string | null,
      status: 'failed' as const,
      error: 'Missing POSTMARK_SERVER_TOKEN',
      raw: null as PostmarkResponse | null,
    };
  }

  try {
    const res = await fetch(`https://api.postmarkapp.com${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = (await res.json()) as PostmarkResponse;
    if (!res.ok || (data?.ErrorCode ?? 0) !== 0) {
      return {
        ok: false,
        messageId: data?.MessageID ?? null,
        status: 'failed' as const,
        error: data?.Message ?? `Postmark API error (${res.status})`,
        raw: data,
      };
    }
    return {
      ok: true,
      messageId: data?.MessageID ?? null,
      status: 'sent' as const,
      error: null as string | null,
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      messageId: null as string | null,
      status: 'failed' as const,
      error: err instanceof Error ? err.message : 'Postmark request failed',
      raw: null as PostmarkResponse | null,
    };
  }
}

export async function sendEmail(options: SendEmailOptions) {
  const cfg = getPostmarkConfig();
  const from = options.from ?? cfg.from;
  if (!from) {
    return {
      ok: false,
      messageId: null as string | null,
      status: 'failed' as const,
      error: 'Missing POSTMARK_FROM_EMAIL',
      raw: null as PostmarkResponse | null,
    };
  }

  const payload = {
    From: from,
    To: options.to,
    Cc: options.cc,
    Bcc: options.bcc,
    ReplyTo: options.replyTo ?? cfg.replyTo,
    Subject: options.subject,
    HtmlBody: options.htmlBody ?? undefined,
    TextBody: options.textBody ?? undefined,
    Tag: options.tag ?? undefined,
    Metadata: asRecord(options.metadata),
    MessageStream: options.messageStream ?? cfg.messageStream ?? undefined,
    Attachments: options.attachments ?? undefined,
    Headers: [
      {
        Name: 'X-Notification-Trace',
        Value: randomUUID(),
      },
    ],
  };

  return callPostmark('/email', payload);
}

export async function sendTemplatedEmail(options: SendTemplatedEmailOptions) {
  const cfg = getPostmarkConfig();
  const from = options.from ?? cfg.from;
  if (!from) {
    return {
      ok: false,
      messageId: null as string | null,
      status: 'failed' as const,
      error: 'Missing POSTMARK_FROM_EMAIL',
      raw: null as PostmarkResponse | null,
    };
  }
  if (!options.templateId && !options.templateAlias) {
    return {
      ok: false,
      messageId: null as string | null,
      status: 'failed' as const,
      error: 'Missing Postmark template configuration',
      raw: null as PostmarkResponse | null,
    };
  }

  const payload = {
    From: from,
    To: options.to,
    Cc: options.cc,
    Bcc: options.bcc,
    ReplyTo: options.replyTo ?? cfg.replyTo,
    TemplateId: options.templateId,
    TemplateAlias: options.templateAlias,
    TemplateModel: options.templateModel,
    Tag: options.tag ?? undefined,
    Metadata: asRecord(options.metadata),
    MessageStream: options.messageStream ?? cfg.messageStream ?? undefined,
    Attachments: options.attachments ?? undefined,
  };

  return callPostmark('/email/withTemplate', payload);
}

export async function sendBatchEmails(
  items: Array<{
    to: string;
    subject: string;
    htmlBody?: string;
    textBody?: string;
    tag?: string;
    metadata?: Record<string, string>;
  }>
) {
  const results = await Promise.all(
    items.map((item) =>
      sendEmail({
        to: item.to,
        subject: item.subject,
        htmlBody: item.htmlBody,
        textBody: item.textBody,
        tag: item.tag,
        metadata: item.metadata,
      })
    )
  );
  return results;
}

