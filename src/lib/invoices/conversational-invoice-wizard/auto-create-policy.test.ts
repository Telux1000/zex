import { describe, it, expect } from 'vitest';
import { shouldAutoCreateInvoiceFromWizardTurn } from './auto-create-policy';

describe('shouldAutoCreateInvoiceFromWizardTurn', () => {
  it('does not auto-create when draft was already ready at turn start (stale session / “Create an Invoice”)', () => {
    expect(
      shouldAutoCreateInvoiceFromWizardTurn({
        userText: 'Create an Invoice',
        action: null,
        readyAfter: true,
        readyBefore: true,
        extractHadInvoicePayload: false,
      })
    ).toBe(false);
  });

  it('does not auto-create when readyBefore even if extract had payload', () => {
    expect(
      shouldAutoCreateInvoiceFromWizardTurn({
        userText: 'Create an invoice for Company B',
        action: null,
        readyAfter: true,
        readyBefore: true,
        extractHadInvoicePayload: true,
      })
    ).toBe(false);
  });

  it('auto-creates when this turn first reaches ready via extraction', () => {
    expect(
      shouldAutoCreateInvoiceFromWizardTurn({
        userText: 'Invoice Acme for 2 widgets at $100, due Friday',
        action: null,
        readyAfter: true,
        readyBefore: false,
        extractHadInvoicePayload: true,
      })
    ).toBe(true);
  });

  it('does not auto-create without extract payload', () => {
    expect(
      shouldAutoCreateInvoiceFromWizardTurn({
        userText: 'thanks',
        action: null,
        readyAfter: true,
        readyBefore: false,
        extractHadInvoicePayload: false,
      })
    ).toBe(false);
  });

  it('does not auto-create with an action', () => {
    expect(
      shouldAutoCreateInvoiceFromWizardTurn({
        userText: 'x',
        action: { type: 'confirm_create', idempotency_key: 'k' },
        readyAfter: true,
        readyBefore: false,
        extractHadInvoicePayload: true,
      })
    ).toBe(false);
  });
});
