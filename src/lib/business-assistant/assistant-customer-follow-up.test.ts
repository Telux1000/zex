import { describe, expect, it } from 'vitest';
import {
  isAssistantAffirmation,
  isAssistantConfirmationDecline,
  normalizePendingCustomerContextFromUnknown,
} from './assistant-customer-follow-up';

describe('isAssistantConfirmationDecline', () => {
  it('matches short declines only', () => {
    expect(isAssistantConfirmationDecline('no')).toBe(true);
    expect(isAssistantConfirmationDecline('No.')).toBe(true);
    expect(isAssistantConfirmationDecline('nope')).toBe(true);
    expect(isAssistantConfirmationDecline('nah')).toBe(true);
    expect(isAssistantConfirmationDecline('not now')).toBe(true);
    expect(isAssistantConfirmationDecline("don't")).toBe(true);
    expect(isAssistantConfirmationDecline('do not')).toBe(true);
    expect(isAssistantConfirmationDecline('skip')).toBe(true);
    expect(isAssistantConfirmationDecline('pass')).toBe(true);
  });

  it('does not match arbitrary text', () => {
    expect(isAssistantConfirmationDecline('no I want an invoice')).toBe(false);
    expect(isAssistantConfirmationDecline('')).toBe(false);
    expect(isAssistantConfirmationDecline('yes')).toBe(false);
  });
});

describe('single_confirm confirmation_state round-trip', () => {
  it('normalizes confirmation_state from wire', () => {
    const p = normalizePendingCustomerContextFromUnknown({
      kind: 'single_confirm',
      customer_id: 'c1',
      display_name: 'Acme',
      default_action: 'edit_customer',
      can_edit_customer: true,
      confirmation_state: {
        pendingQuestionType: 'confirm_duplicate_customer',
        activeWorkflow: 'create_customer',
        targetEntityType: 'customer',
        targetEntityId: 'c1',
        defaultYesAction: 'edit_customer',
        defaultNoAction: null,
      },
    });
    expect(p?.kind).toBe('single_confirm');
    if (p?.kind === 'single_confirm') {
      expect(p.confirmation_state?.pendingQuestionType).toBe('confirm_duplicate_customer');
      expect(p.confirmation_state?.activeWorkflow).toBe('create_customer');
      expect(p.confirmation_state?.targetEntityId).toBe('c1');
    }
  });

  it('normalizes awaiting_customer_email_update context', () => {
    const p = normalizePendingCustomerContextFromUnknown({
      kind: 'awaiting_customer_email_update',
      pending_new_email: 'billing@example.com',
    });
    expect(p?.kind).toBe('awaiting_customer_email_update');
    if (p?.kind === 'awaiting_customer_email_update') {
      expect(p.pending_new_email).toBe('billing@example.com');
    }
  });

  it('maps legacy pending_question + active_workflow', () => {
    const p = normalizePendingCustomerContextFromUnknown({
      kind: 'single_confirm',
      customer_id: 'c1',
      display_name: 'Acme',
      default_action: 'edit_customer',
      can_edit_customer: true,
      pending_question: 'confirm_edit_customer',
      active_workflow: 'create_customer',
    });
    expect(p?.kind).toBe('single_confirm');
    if (p?.kind === 'single_confirm') {
      expect(p.confirmation_state?.pendingQuestionType).toBe('confirm_edit_customer');
      expect(p.confirmation_state?.activeWorkflow).toBe('create_customer');
      expect(p.confirmation_state?.targetEntityId).toBe('c1');
    }
  });
});

describe('affirmation vs decline', () => {
  it('no overlap on ok vs no', () => {
    expect(isAssistantAffirmation('ok')).toBe(true);
    expect(isAssistantConfirmationDecline('ok')).toBe(false);
    expect(isAssistantConfirmationDecline('no')).toBe(true);
    expect(isAssistantAffirmation('no')).toBe(false);
  });
});
