import { describe, expect, it } from 'vitest';
import type { ReminderTimingEntry } from '@/lib/invoices/reminder-settings';
import {
  assertNonEmptyReminderOutput,
  buildPostmarkPaymentReminderTemplateModel,
  buildReminderRenderVariables,
  classifyPresetFromDateOffset,
  classifyPresetFromOffsetMatch,
  createDefaultReminderMessagingSettings,
  interpolateReminderTemplate,
  parseReminderMessaging,
  renderReminderSubjectAndMessage,
  reminderMessageToHtmlFragment,
  validatePlaceholderKeys,
  validateReminderMessaging,
} from '@/lib/invoices/reminder-messaging';

describe('reminder-messaging', () => {
  it('rejects unknown placeholder tokens in validation', () => {
    const t = 'Hello {{customer_name}} {{hacker}}';
    const { ok, unknown } = validatePlaceholderKeys(t);
    expect(ok).toBe(false);
    expect(unknown).toContain('hacker');
  });

  it('accepts all supported keys', () => {
    const t = '{{customer_name}} {{support_email}} {{amount_due}}';
    expect(validatePlaceholderKeys(t).ok).toBe(true);
  });

  it('escapes message for HTML and preserves line breaks', () => {
    const h = reminderMessageToHtmlFragment('A & B\nC');
    expect(h).toContain('A &amp; B');
    expect(h).toContain('<br />');
  });

  it('classifies before / due / overdue from offset and timing entry', () => {
    const before = { days: 2, relativeTo: 'before_due' as const };
    const all: ReminderTimingEntry[] = [
      before,
      { days: 3, relativeTo: 'after_due' },
      { days: 7, relativeTo: 'after_due' },
    ];
    expect(classifyPresetFromOffsetMatch(-2, before, all)).toBe('before_due');
    expect(
      classifyPresetFromOffsetMatch(0, { days: 0, relativeTo: 'before_due' }, all)
    ).toBe('due_today');
    const m2 = { days: 3, relativeTo: 'after_due' as const };
    expect(classifyPresetFromOffsetMatch(3, m2, all)).toBe('overdue');
    const m3 = { days: 7, relativeTo: 'after_due' as const };
    expect(classifyPresetFromOffsetMatch(7, m3, all)).toBe('final_reminder');
  });

  it('classifyPresetFromDateOffset: single after-due rule uses overdue, not final', () => {
    const one = [{ days: 7, relativeTo: 'after_due' as const }];
    expect(classifyPresetFromDateOffset(7, one)).toBe('overdue');
  });

  it('classifyPresetFromDateOffset: two after-due rules, max offset is final', () => {
    const all = [
      { days: 1, relativeTo: 'after_due' as const },
      { days: 4, relativeTo: 'after_due' as const },
    ];
    expect(classifyPresetFromDateOffset(1, all)).toBe('overdue');
    expect(classifyPresetFromDateOffset(4, all)).toBe('final_reminder');
  });

  it('interpolates and strips unknown tag keys', () => {
    const vars = buildReminderRenderVariables({
      customerName: 'Sam',
      businessName: 'Acme',
      invoiceNumber: '1',
      amount: 10,
      currency: 'USD',
      dueDateIso: '2026-05-20',
      paymentUrl: 'https://pay.example.com/x',
      supportEmail: 'help@acme.com',
    });
    const out = interpolateReminderTemplate(
      'Hi {{customer_name}} {{nope}}',
      vars
    );
    expect(out).toBe('Hi Sam ');
  });

  it('parse accepts version as string "1"', () => {
    const raw = {
      version: '1',
      presets: createDefaultReminderMessagingSettings().presets,
    };
    const s = parseReminderMessaging(raw);
    expect(s.version).toBe(1);
  });

  it('parse accepts reminder_messaging stored as JSON string', () => {
    const inner = createDefaultReminderMessagingSettings();
    inner.presets.overdue.enabled = true;
    inner.presets.overdue.subject_template = 'S {{invoice_number}}';
    inner.presets.overdue.message_template = 'M {{customer_name}}';
    const s = parseReminderMessaging(JSON.stringify(inner));
    expect(s.presets.overdue.enabled).toBe(true);
  });

  it('parse treats enabled "true" string as customize on', () => {
    const s = parseReminderMessaging({
      version: 1,
      presets: {
        before_due: {
          enabled: 'true',
          subject_template: 'Custom subj {{invoice_number}}',
          message_template: 'Hello {{customer_name}}',
          tone: 'professional',
        },
        due_today: createDefaultReminderMessagingSettings().presets.due_today,
        overdue: createDefaultReminderMessagingSettings().presets.overdue,
        final_reminder: createDefaultReminderMessagingSettings().presets.final_reminder,
      },
    } as unknown as Parameters<typeof parseReminderMessaging>[0]);
    expect(s.presets.before_due.enabled).toBe(true);
  });

  it('parse accepts use_custom_copy as alias for enabled', () => {
    const raw = {
      version: 1,
      presets: {
        before_due: { use_custom_copy: false, subject_template: 'x', message_template: 'y', tone: 'professional' },
        due_today: { enabled: true, subject_template: 'a', message_template: 'b', tone: 'professional' },
        overdue: { enabled: true, subject_template: 'a', message_template: 'b', tone: 'professional' },
        final_reminder: { enabled: true, subject_template: 'a', message_template: 'b', tone: 'professional' },
      },
    };
    const s = parseReminderMessaging(raw);
    expect(s.presets.before_due.enabled).toBe(false);
    expect(s.presets.due_today.enabled).toBe(true);
  });

  it('parse keeps customize enabled when legacy flags conflict', () => {
    const s = parseReminderMessaging({
      version: 1,
      presets: {
        overdue: {
          use_custom_copy: false,
          enabled: true,
          subject_template: 'Overdue {{invoice_number}}',
          message_template: 'Custom body {{customer_name}}',
          tone: 'professional',
        },
      },
    });
    expect(s.presets.overdue.enabled).toBe(true);
  });

  it('legacy row without enabled uses default mode when text matches default', () => {
    const s = parseReminderMessaging({
      version: 1,
      presets: {
        before_due: {
          tone: 'professional',
          subject_template: 'Upcoming payment reminder for invoice {{invoice_number}}',
          message_template:
            'Hello {{customer_name}},\n\nThis is a reminder that invoice {{invoice_number}} for {{amount_due}} is due on {{due_date}}.\nYou can view and pay the invoice using the link below.',
        },
      },
    });
    expect(s.presets.before_due.enabled).toBe(false);
  });

  it('legacy row without enabled uses customize mode when text differs', () => {
    const s = parseReminderMessaging({
      version: 1,
      presets: {
        overdue: {
          tone: 'professional',
          subject_template: 'Overdue {{invoice_number}}',
          message_template: 'Custom body {{customer_name}}',
        },
      },
    });
    expect(s.presets.overdue.enabled).toBe(true);
  });

  it('validate requires subject/body when customize is enabled', () => {
    const s = createDefaultReminderMessagingSettings();
    s.presets.before_due.enabled = true;
    s.presets.before_due.subject_template = '  ';
    const v = validateReminderMessaging(s);
    expect(v.ok).toBe(false);
  });

  it('render with defaults is non-empty', () => {
    const vars = buildReminderRenderVariables({
      customerName: 'A',
      businessName: 'B',
      invoiceNumber: '1',
      amount: 1,
      currency: 'USD',
      dueDateIso: '2026-01-01',
      paymentUrl: '',
      supportEmail: 'x@y.com',
    });
    const s = createDefaultReminderMessagingSettings();
    const a = assertNonEmptyReminderOutput(
      'overdue',
      vars,
      '',
      '   '
    );
    expect(a.subject.length).toBeGreaterThan(0);
    const r = renderReminderSubjectAndMessage(s, 'before_due', vars);
    expect(r.subject).toBeTruthy();
    expect(r.messagePlain).toBeTruthy();
  });

  it('falls back to professional defaults when customize mode is incomplete', () => {
    const vars = buildReminderRenderVariables({
      customerName: 'A',
      businessName: 'B',
      invoiceNumber: 'INV-9',
      amount: 99,
      currency: 'USD',
      dueDateIso: '2026-01-01',
      paymentUrl: 'https://pay.example.com/x',
      supportEmail: 'help@example.com',
    });
    const s = createDefaultReminderMessagingSettings();
    s.presets.overdue.enabled = true;
    s.presets.overdue.subject_template = '';
    s.presets.overdue.message_template = 'Custom {{invoice_number}}';
    const out = buildPostmarkPaymentReminderTemplateModel({
      st: s,
      preset: 'overdue',
      vars,
      hasPaymentUrl: true,
      rawAmount: 99,
      currencyCode: 'USD',
    });
    expect(out.subject).toContain('Reminder');
    expect(out.messagePlain).toContain('invoice INV-9');
  });

  it('builds payment reminder template model with required keys', () => {
    const vars = buildReminderRenderVariables({
      customerName: 'A',
      businessName: 'B',
      invoiceNumber: 'INV-22',
      amount: 120,
      currency: 'USD',
      dueDateIso: '2026-02-10',
      paymentUrl: 'https://pay.example.com/inv-22',
      supportEmail: 'billing@example.com',
    });
    const model = buildPostmarkPaymentReminderTemplateModel({
      st: createDefaultReminderMessagingSettings(),
      preset: 'before_due',
      vars,
      hasPaymentUrl: true,
      rawAmount: 120,
      currencyCode: 'USD',
    }).templateModel as Record<string, unknown>;
    expect(typeof model.subject).toBe('string');
    expect(typeof model.reminder_message).toBe('string');
    expect(typeof model.customer_name).toBe('string');
    expect(typeof model.invoice_number).toBe('string');
    expect(typeof model.amount_due).toBe('string');
    expect(typeof model.due_date).toBe('string');
    expect(typeof model.payment_link).toBe('string');
    expect(typeof model.business_name).toBe('string');
  });

  it('escapes stray {{ in merge HTML so Postmark nested templates do not break', () => {
    const vars = buildReminderRenderVariables({
      customerName: 'A',
      businessName: 'B',
      invoiceNumber: '1',
      amount: 10,
      currency: 'USD',
      dueDateIso: '2026-05-20',
      paymentUrl: 'https://pay.example.com/x',
      supportEmail: 'help@acme.com',
    });
    const s = createDefaultReminderMessagingSettings();
    s.presets.before_due.enabled = true;
    s.presets.before_due.subject_template = 'Hi {{invoice_number}}';
    s.presets.before_due.message_template = 'Literal {{ double brace';
    const { templateModel } = buildPostmarkPaymentReminderTemplateModel({
      st: s,
      preset: 'before_due',
      vars,
      hasPaymentUrl: true,
      rawAmount: 10,
      currencyCode: 'USD',
    });
    const html = String((templateModel as { reminder_message?: string }).reminder_message ?? '');
    expect(html).toContain('&#123;&#123;');
    expect(html).not.toMatch(/\{\{\s*$/);
  });
});
