import { describe, expect, it } from 'vitest';
import {
  augmentEditInvoiceWithoutReference,
  isWeakConfirmationUserText,
  resolveAssistantFollowUpUserText,
} from '@/lib/business-assistant/claude/assistant-follow-up-resolver';
import type { AssistantResponseMetaV1 } from '@/lib/business-assistant/claude/assistant-response-meta';

const summaryMeta: AssistantResponseMetaV1 = {
  response_type: 'summary_with_breakdown_options',
  intent_confidence: 'high',
  entity_confidence: 'high',
  context_strength: 'strong',
  ambiguity_count: 0,
  available_actions: ['breakdown_customer', 'breakdown_day', 'breakdown_invoice'],
  default_action: 'breakdown_customer',
  period_key: 'last_month',
  start_date: null,
  end_date: null,
};

describe('isWeakConfirmationUserText', () => {
  it('matches short confirmations', () => {
    expect(isWeakConfirmationUserText('yes')).toBe(true);
    expect(isWeakConfirmationUserText('OK')).toBe(true);
    expect(isWeakConfirmationUserText('go ahead')).toBe(true);
    expect(isWeakConfirmationUserText('please do')).toBe(true);
    expect(isWeakConfirmationUserText('sounds good')).toBe(true);
  });
  it('rejects long or specific text', () => {
    expect(isWeakConfirmationUserText('yes by customer please')).toBe(false);
    expect(isWeakConfirmationUserText('x'.repeat(50))).toBe(false);
  });
});

describe('resolveAssistantFollowUpUserText', () => {
  it('replaces weak confirmation with breakdown directive when prior summary offered defaults', () => {
    const r = resolveAssistantFollowUpUserText({
      userText: 'yes',
      priorResponseMeta: summaryMeta,
    });
    expect(r.decision).toBe('act_default');
    expect(r.effective_user_text).toContain('get_metric_breakdown');
    expect(r.effective_user_text).toContain('breakdown_dimension "customer"');
    expect(r.effective_user_text).toContain('last_month');
  });

  it('passes through when prior meta is missing', () => {
    const r = resolveAssistantFollowUpUserText({ userText: 'yes', priorResponseMeta: null });
    expect(r.decision).toBe('pass_through');
    expect(r.effective_user_text).toBe('yes');
  });

  it('does not act on disambiguation_prompt', () => {
    const meta: AssistantResponseMetaV1 = {
      ...summaryMeta,
      response_type: 'disambiguation_prompt',
    };
    const r = resolveAssistantFollowUpUserText({ userText: 'ok', priorResponseMeta: meta });
    expect(r.decision).toBe('pass_through');
  });
});

describe('augmentEditInvoiceWithoutReference', () => {
  it('adds system hint for bare edit invoice', () => {
    const out = augmentEditInvoiceWithoutReference('edit invoice');
    expect(out).toContain('no invoice number');
  });
  it('returns null when reference present', () => {
    expect(augmentEditInvoiceWithoutReference('edit invoice INV-59')).toBeNull();
  });
});
