import { formatCurrencyAmount } from '@/lib/utils/currency';
import {
  calendarOffsetFromDue,
  type ReminderTimingEntry,
} from '@/lib/invoices/reminder-settings';

/** Postmark / customer-facing template variables (snake_case in user copy). */
export const REMINDER_PLACEHOLDER_KEYS = [
  'customer_name',
  'business_name',
  'invoice_number',
  'amount_due',
  'due_date',
  'payment_link',
  'support_email',
] as const;

export type ReminderPlaceholderKey = (typeof REMINDER_PLACEHOLDER_KEYS)[number];

/** Shown in templates as `{{support_email}}`; also used in headers / footer. */
export function resolveOutboundSupportEmail(
  businessEmail: string | null | undefined
): string {
  const a = String(
    process.env.SUPPORT_EMAIL ?? process.env.POSTMARK_REPLY_TO ?? businessEmail ?? ''
  ).trim();
  return a || 'support@example.com';
}

export const REMINDER_MESSAGE_PRESETS = [
  'before_due',
  'due_today',
  'overdue',
  'final_reminder',
] as const;

export type ReminderMessagePreset = (typeof REMINDER_MESSAGE_PRESETS)[number];

/** Human label for each copy bucket (matches Settings → Reminder emails). */
export const REMINDER_PRESET_DISPLAY_LABEL: Record<ReminderMessagePreset, string> = {
  before_due: 'Before due date',
  due_today: 'Due today',
  overdue: 'Overdue',
  final_reminder: 'Final reminder',
};

export const REMINDER_TONES = ['professional', 'friendly', 'firm'] as const;
export type ReminderTone = (typeof REMINDER_TONES)[number];

export type ReminderPresetRow = {
  /**
   * When `true`, use `subject_template` and `message_template` for this reminder type.
   * When `false`, send uses the default copy for the selected `tone` (same as UI “Use default message”).
   * Optional alias in JSON: `use_custom_copy` (same meaning as `enabled`).
   */
  enabled: boolean;
  subject_template: string;
  message_template: string;
  tone: ReminderTone;
  updated_at?: string;
};

export type ReminderMessagingSettingsV1 = {
  version: 1;
  presets: Record<ReminderMessagePreset, ReminderPresetRow>;
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** C0 / delete control chars that can break JSON or email providers. Newlines allowed. */
const STRIP_CTRL_EXCEPT_NL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function isReminderSettingsVersion1(v: unknown): boolean {
  if (v === 1) return true;
  if (v === '1') return true;
  if (typeof v === 'string' && String(v).trim() === '1') return true;
  if (typeof v === 'number' && Number.isFinite(v) && Math.trunc(v) === 1) return true;
  return false;
}

/**
 * Coerce various JSON/Form values to boolean. Used for `enabled` / `use_custom_copy`
 * so Customize mode survives string booleans (e.g. "true") and doesn't fall through
 * to the legacy "text differs from default" path with enabled accidentally false.
 */
export function coerceLooseBoolean(v: unknown): boolean | undefined {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true' || t === '1' || t === 'yes' || t === 'on') return true;
    if (t === 'false' || t === '0' || t === 'no' || t === 'off' || t === '') return false;
  }
  return undefined;
}

function stripMergeControlChars(s: string): string {
  return s.replace(STRIP_CTRL_EXCEPT_NL, '');
}

/**
 * Postmark templates use Mustache; if merge field values still contain `{{`/`}}` after
 * our placeholder pass (user literals or unclosed `{{`), the send can error. Neutralize
 * in HTML and plain text merge values.
 */
function neutralizeStrayMustacheInHtml(s: string): string {
  return s.replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;');
}

function neutralizeStrayMustacheInPlainText(s: string): string {
  return s.replace(/\{\{/g, '\uFF5B\uFF5B').replace(/\}\}/g, '\uFF5D\uFF5D');
}

/**
 * HTML fragment for the payment reminder body (and Postmark `reminder_message` merge field).
 * Strips C0 control chars, escapes, line breaks, then neutralizes stray `{{` for Postmark/Mustache.
 */
export function toPostmarkPaymentReminderMessageHtml(plain: string): string {
  return neutralizeStrayMustacheInHtml(reminderMessageToHtmlFragment(stripMergeControlChars(plain)));
}

function defaultPresetRow(tone: ReminderTone, preset: ReminderMessagePreset): ReminderPresetRow {
  const d = DEFAULT_COPY[tone][preset];
  return {
    enabled: false,
    subject_template: d.subject,
    message_template: d.message,
    tone,
  };
}

/** Default copy per tone (used for reset and when a preset is disabled). */
export const DEFAULT_COPY: Record<
  ReminderTone,
  Record<ReminderMessagePreset, { subject: string; message: string }>
> = {
  professional: {
    before_due: {
      subject: 'Upcoming payment reminder for invoice {{invoice_number}}',
      message: `Hello {{customer_name}},

This is a reminder that invoice {{invoice_number}} for {{amount_due}} is due on {{due_date}}.
You can view and pay the invoice using the link below.`,
    },
    due_today: {
      subject: 'Invoice {{invoice_number}} is due today',
      message: `Hello {{customer_name}},

Invoice {{invoice_number}} for {{amount_due}} is due today.
Please use the link below to view and pay securely.`,
    },
    overdue: {
      subject: 'Reminder: Invoice {{invoice_number}} is overdue',
      message: `Hello {{customer_name}},

This is a reminder that invoice {{invoice_number}} for {{amount_due}} was due on {{due_date}}.
Please arrange payment at your earliest convenience.`,
    },
    final_reminder: {
      subject: 'Final reminder: Invoice {{invoice_number}} remains unpaid',
      message: `Hello {{customer_name}},

Invoice {{invoice_number}} for {{amount_due}} remains unpaid after previous reminders.
Please arrange payment as soon as possible or contact us if there is an issue.`,
    },
  },
  friendly: {
    before_due: {
      subject: 'Friendly heads-up: invoice {{invoice_number}}',
      message: `Hi {{customer_name}},

Just a quick note that invoice {{invoice_number}} for {{amount_due}} is coming up — it is due on {{due_date}}.
When you have a moment, you can view and pay with the link below. Thank you.`,
    },
    due_today: {
      subject: 'Invoice {{invoice_number}} is due today',
      message: `Hi {{customer_name}},

Hope you are well. Invoice {{invoice_number}} for {{amount_due}} is due today.
You can use the secure link below whenever you are ready.`,
    },
    overdue: {
      subject: 'Invoice {{invoice_number}} — quick follow-up',
      message: `Hi {{customer_name}},

We wanted to follow up on invoice {{invoice_number}} for {{amount_due}} (original due date {{due_date}}).
If you can take care of it when you get a chance, the link below is the easiest way to pay.`,
    },
    final_reminder: {
      subject: 'Last nudge: invoice {{invoice_number}}',
      message: `Hi {{customer_name}},

We are still showing invoice {{invoice_number}} for {{amount_due}} as unpaid.
If something is wrong on our side, please let us know at {{support_email}}. Otherwise, payment via the link below would be greatly appreciated.`,
    },
  },
  firm: {
    before_due: {
      subject: 'Payment due soon — invoice {{invoice_number}}',
      message: `{{customer_name}},

Invoice {{invoice_number}} for {{amount_due}} is due on {{due_date}}.
Please plan payment by the due date. View and pay: {{payment_link}}`,
    },
    due_today: {
      subject: 'Due today: invoice {{invoice_number}}',
      message: `{{customer_name}},

Invoice {{invoice_number}} for {{amount_due}} is due today.
Payment is required. Use the link below.`,
    },
    overdue: {
      subject: 'Overdue: invoice {{invoice_number}}',
      message: `{{customer_name}},

Invoice {{invoice_number}} for {{amount_due}} was due on {{due_date}} and remains outstanding.
Please remit payment promptly using the link below.`,
    },
    final_reminder: {
      subject: 'Final notice: invoice {{invoice_number}} unpaid',
      message: `{{customer_name}},

Invoice {{invoice_number}} for {{amount_due}} is still unpaid after prior notices.
Contact {{support_email}} if there is a dispute; otherwise pay immediately using the link below.`,
    },
  },
};

export function createDefaultReminderMessagingSettings(): ReminderMessagingSettingsV1 {
  const tone: ReminderTone = 'professional';
  return {
    version: 1,
    presets: {
      before_due: defaultPresetRow(tone, 'before_due'),
      due_today: defaultPresetRow(tone, 'due_today'),
      overdue: defaultPresetRow(tone, 'overdue'),
      final_reminder: defaultPresetRow(tone, 'final_reminder'),
    },
  };
}

function isReminderTone(x: unknown): x is ReminderTone {
  return typeof x === 'string' && (REMINDER_TONES as readonly string[]).includes(x);
}

function parsePresetRow(
  raw: unknown,
  preset: ReminderMessagePreset
): ReminderPresetRow {
  if (!raw || typeof raw !== 'object') {
    return createDefaultReminderMessagingSettings().presets[preset];
  }
  const o = raw as Record<string, unknown>;
  const base = createDefaultReminderMessagingSettings().presets[preset];
  const tone = isReminderTone(o.tone) ? o.tone : base.tone;
  const subjectTemplate =
    typeof o.subject_template === 'string' ? o.subject_template : base.subject_template;
  const messageTemplate =
    typeof o.message_template === 'string' ? o.message_template : base.message_template;
  const defaultForTone = DEFAULT_COPY[tone][preset];
  const uc = coerceLooseBoolean(o.use_custom_copy);
  const eb = coerceLooseBoolean(o.enabled);
  let enabled: boolean;
  if (uc !== undefined && eb !== undefined) {
    // Be permissive with legacy mixed payloads: any explicit "true" keeps customize mode on.
    enabled = uc || eb;
  } else if (uc !== undefined) {
    enabled = uc;
  } else if (eb !== undefined) {
    enabled = eb;
  } else if (typeof o.use_custom_copy === 'boolean' && typeof o.enabled === 'boolean') {
    enabled = o.use_custom_copy || o.enabled;
  } else if (typeof o.use_custom_copy === 'boolean') {
    enabled = o.use_custom_copy;
  } else if (typeof o.enabled === 'boolean') {
    enabled = o.enabled;
  } else {
    // Legacy rows without explicit flag: treat as custom only when text differs from defaults.
    const hasNonDefaultSubject =
      String(subjectTemplate).trim() !== String(defaultForTone.subject).trim();
    const hasNonDefaultMessage =
      String(messageTemplate).trim() !== String(defaultForTone.message).trim();
    enabled = hasNonDefaultSubject || hasNonDefaultMessage;
  }
  return {
    enabled,
    subject_template: subjectTemplate,
    message_template: messageTemplate,
    tone,
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : base.updated_at,
  };
}

export function parseReminderMessaging(
  raw: unknown
): ReminderMessagingSettingsV1 {
  if (raw == null) {
    return createDefaultReminderMessagingSettings();
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) {
      return createDefaultReminderMessagingSettings();
    }
    try {
      return parseReminderMessaging(JSON.parse(t) as unknown);
    } catch {
      return createDefaultReminderMessagingSettings();
    }
  }
  if (typeof raw !== 'object') {
    return createDefaultReminderMessagingSettings();
  }
  const o = raw as Record<string, unknown>;
  if (!isReminderSettingsVersion1(o.version)) {
    return createDefaultReminderMessagingSettings();
  }
  const p = o.presets;
  if (!p || typeof p !== 'object') {
    return createDefaultReminderMessagingSettings();
  }
  return {
    version: 1,
    presets: {
      before_due: parsePresetRow((p as Record<string, unknown>).before_due, 'before_due'),
      due_today: parsePresetRow((p as Record<string, unknown>).due_today, 'due_today'),
      overdue: parsePresetRow((p as Record<string, unknown>).overdue, 'overdue'),
      final_reminder: parsePresetRow(
        (p as Record<string, unknown>).final_reminder,
        'final_reminder'
      ),
    },
  };
}

export function extractPlaceholderKeys(template: string): string[] {
  const keys: string[] = [];
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    keys.push(String(m[1] ?? ''));
  }
  return keys;
}

export function validatePlaceholderKeys(template: string): {
  ok: boolean;
  unknown: string[];
} {
  const unknown: string[] = [];
  for (const k of extractPlaceholderKeys(template)) {
    if (!(REMINDER_PLACEHOLDER_KEYS as readonly string[]).includes(k)) {
      unknown.push(k);
    }
  }
  return { ok: unknown.length === 0, unknown };
}

export function validateReminderMessaging(
  s: ReminderMessagingSettingsV1
): { ok: true } | { ok: false; error: string; field?: string } {
  for (const key of REMINDER_MESSAGE_PRESETS) {
    const row = s.presets[key];
    if (!row.tone || !(REMINDER_TONES as readonly string[]).includes(row.tone)) {
      return { ok: false, error: `Invalid tone for ${key}`, field: `${key}.tone` };
    }
    if (row.enabled) {
      const subj = String(row.subject_template ?? '').trim();
      const msg = String(row.message_template ?? '').trim();
      if (!subj) {
        return {
          ok: false,
          error: `Add a subject for “${key}” or choose “Use default message”.`,
          field: `${key}.subject_template`,
        };
      }
      if (!msg) {
        return {
          ok: false,
          error: `Add a message for “${key}” or choose “Use default message”.`,
          field: `${key}.message_template`,
        };
      }
      const sCheck = validatePlaceholderKeys(row.subject_template);
      if (!sCheck.ok) {
        return {
          ok: false,
          error: `Unknown placeholders in ${key} subject: ${sCheck.unknown.join(', ')}`,
          field: `${key}.subject_template`,
        };
      }
      const mCheck = validatePlaceholderKeys(row.message_template);
      if (!mCheck.ok) {
        return {
          ok: false,
          error: `Unknown placeholders in ${key} message: ${mCheck.unknown.join(', ')}`,
          field: `${key}.message_template`,
        };
      }
    }
  }
  return { ok: true };
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Safe HTML block for Postmark: escape user + merge output, newlines to <br />. */
export function reminderMessageToHtmlFragment(plain: string): string {
  return escapeHtmlText(plain)
    .split('\n')
    .map((line) => line || '&nbsp;')
    .join('<br />\n');
}

export type ReminderRenderVariables = {
  customer_name: string;
  business_name: string;
  invoice_number: string;
  amount_due: string;
  due_date: string;
  payment_link: string;
  support_email: string;
};

export function buildReminderRenderVariables(
  input: {
    customerName: string;
    businessName: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    dueDateIso: string;
    paymentUrl: string;
    supportEmail: string;
  }
): ReminderRenderVariables {
  return {
    customer_name: String(input.customerName || '').trim() || 'There',
    business_name: String(input.businessName || '').trim() || 'Us',
    invoice_number: String(input.invoiceNumber || '').trim() || '—',
    amount_due: formatCurrencyAmount(Number(input.amount) || 0, input.currency),
    due_date: formatDueDateForReminder(String(input.dueDateIso || '')),
    payment_link: String(input.paymentUrl || '').trim(),
    support_email: String(input.supportEmail || '').trim() || 'support@example.com',
  };
}

function toDateOnly(value: string) {
  return String(value ?? '').slice(0, 10);
}

export function formatDueDateForReminder(iso: string): string {
  const d = toDateOnly(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return d || '—';
  }
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return d;
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Interpolate `{{name}}` from variables. Unknown keys are left empty; unknown in template
 * is already rejected on save; this is a last-resort for legacy rows.
 */
export function interpolateReminderTemplate(
  template: string,
  vars: ReminderRenderVariables
): string {
  PLACEHOLDER_RE.lastIndex = 0;
  return template.replace(PLACEHOLDER_RE, (_m, g1) => {
    const key = String(g1) as keyof ReminderRenderVariables;
    const v = vars[key as keyof ReminderRenderVariables];
    if (v == null) return '';
    if ((REMINDER_PLACEHOLDER_KEYS as readonly string[]).includes(String(g1))) {
      return String(v);
    }
    return '';
  });
}

function getEffectiveRow(
  st: ReminderMessagingSettingsV1,
  preset: ReminderMessagePreset
): { subject: string; message: string; tone: ReminderTone } {
  const row = st.presets[preset];
  const professionalDefault = DEFAULT_COPY['professional'][preset];
  if (row?.enabled) {
    const t = (REMINDER_TONES as readonly string[]).includes(String(row.tone)) ? row.tone : 'professional';
    const customSubject = String(row.subject_template ?? '').trim();
    const customMessage = String(row.message_template ?? '').trim();
    if (customSubject && customMessage) {
      return {
        subject: row.subject_template,
        message: row.message_template,
        tone: t,
      };
    }
    // Customize mode must never block reminder sends; fall back to professional defaults.
    return {
      subject: professionalDefault.subject,
      message: professionalDefault.message,
      tone: 'professional',
    };
  }
  const tone: ReminderTone = row?.tone && (REMINDER_TONES as readonly string[]).includes(String(row.tone)) ? row.tone : 'professional';
  return {
    subject: DEFAULT_COPY[tone][preset].subject,
    message: DEFAULT_COPY[tone][preset].message,
    tone,
  };
}

export function renderReminderSubjectAndMessage(
  st: ReminderMessagingSettingsV1 | null | undefined,
  preset: ReminderMessagePreset,
  vars: ReminderRenderVariables
): { subject: string; messagePlain: string; tone: ReminderTone } {
  const s = st ? parseReminderMessaging(st) : createDefaultReminderMessagingSettings();
  const eff = getEffectiveRow(s, preset);
  return {
    subject: interpolateReminderTemplate(eff.subject, vars).trim(),
    messagePlain: interpolateReminderTemplate(eff.message, vars).trim(),
    tone: eff.tone,
  };
}

/** Non-empty; falls back to professional defaults. */
export function assertNonEmptyReminderOutput(
  preset: ReminderMessagePreset,
  vars: ReminderRenderVariables,
  subject: string,
  message: string
): { subject: string; message: string } {
  let s = subject;
  let m = message;
  if (!s) s = interpolateReminderTemplate(DEFAULT_COPY['professional'][preset].subject, vars).trim();
  if (!m) m = interpolateReminderTemplate(DEFAULT_COPY['professional'][preset].message, vars).trim();
  if (!s) s = 'Payment reminder';
  if (!m) m = 'Please use the link below to view and pay your invoice.';
  return { subject: s, message: m };
}

function afterDueEntries(all: ReminderTimingEntry[]) {
  return all.filter((e) => e.relativeTo === 'after_due');
}

/**
 * When cron matched a specific offset rule, select which copy bucket to use.
 * See "final" only when there are at least two after-due rules and the matched
 * entry is the one with the largest day offset.
 */
export function classifyPresetFromOffsetMatch(
  offset: number,
  matched: ReminderTimingEntry,
  allEntries: ReminderTimingEntry[]
): ReminderMessagePreset {
  if (offset < 0) {
    return 'before_due';
  }
  if (offset === 0) {
    return 'due_today';
  }
  if (matched.relativeTo === 'before_due') {
    return 'before_due';
  }
  if (matched.relativeTo === 'after_due') {
    const afters = afterDueEntries(allEntries);
    if (afters.length >= 2) {
      const maxD = Math.max(...afters.map((e) => e.days));
      if (matched.days === maxD) {
        return 'final_reminder';
      }
    }
    return 'overdue';
  }
  return 'overdue';
}

/** When no specific timing entry (manual/scheduled) — infer copy from date offset + list. */
export function classifyPresetFromDateOffset(
  offset: number,
  allEntries: ReminderTimingEntry[]
): ReminderMessagePreset {
  if (offset < 0) return 'before_due';
  if (offset === 0) return 'due_today';
  const afters = afterDueEntries(allEntries);
  if (afters.length === 0) {
    return 'overdue';
  }
  if (afters.length >= 2) {
    const maxD = Math.max(...afters.map((e) => e.days));
    if (offset === maxD) {
      return 'final_reminder';
    }
  }
  return 'overdue';
}

export function buildPostmarkPaymentReminderTemplateModel(input: {
  st: ReminderMessagingSettingsV1 | unknown | null;
  preset: ReminderMessagePreset;
  vars: ReminderRenderVariables;
  hasPaymentUrl: boolean;
  /** For legacy Postmark `amountDue` (numeric) field. */
  rawAmount: number;
  currencyCode: string;
}): { subject: string; messagePlain: string; templateModel: Record<string, unknown> } {
  const st = input.st ? parseReminderMessaging(input.st) : createDefaultReminderMessagingSettings();
  const { subject, messagePlain, tone } = renderReminderSubjectAndMessage(
    st,
    input.preset,
    input.vars
  );
  const safe = assertNonEmptyReminderOutput(input.preset, input.vars, subject, messagePlain);
  const sSubj = stripMergeControlChars(safe.subject);
  const sMsg = stripMergeControlChars(safe.message);
  const reminderHtml = toPostmarkPaymentReminderMessageHtml(sMsg);
  const subjectForApi = neutralizeStrayMustacheInPlainText(sSubj);
  const code = (input.currencyCode || 'USD').trim().toUpperCase() || 'USD';
  const model: Record<string, unknown> = {
    subject: subjectForApi,
    reminder_message: reminderHtml,
    customer_name: input.vars.customer_name,
    business_name: input.vars.business_name,
    invoice_number: input.vars.invoice_number,
    amount_due: input.vars.amount_due,
    due_date: input.vars.due_date,
    payment_link: input.vars.payment_link,
    support_email: input.vars.support_email,
    // Legacy camelCase (existing Postmark templates)
    customerName: input.vars.customer_name,
    companyName: input.vars.business_name,
    invoiceNumber: input.vars.invoice_number,
    amountDue: Number(input.rawAmount) || 0,
    dueDate: input.vars.due_date,
    paymentUrl: input.vars.payment_link,
    hasPaymentUrl: input.hasPaymentUrl,
    paymentLinkText: 'View and pay',
    currency: code,
    tone,
  };
  return { subject: subjectForApi, messagePlain: sMsg, templateModel: model };
}

/**
 * Postmark is most reliable when string merge fields are plain strings.
 * Keep booleans/numbers for conditionals and legacy `amountDue` (number) in template.
 */
export function normalizePostmarkPaymentReminderModel(
  model: Record<string, unknown>
): Record<string, unknown> {
  const str = (k: string) => {
    const v = model[k];
    if (v == null) return '';
    return String(v);
  };
  return {
    ...model,
    subject: str('subject'),
    reminder_message: str('reminder_message'),
    customer_name: str('customer_name'),
    business_name: str('business_name'),
    invoice_number: str('invoice_number'),
    amount_due: str('amount_due'),
    due_date: str('due_date'),
    payment_link: str('payment_link'),
    support_email: str('support_email'),
  };
}
