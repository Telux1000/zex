import { describe, it, expect } from 'vitest';
import {
  isBareGenericCreateInvoiceMessage,
  isExplicitNewInvoiceCreationMessage,
  shouldResetDraftForNewInvoiceIntent,
  textLooksLikeCreateInvoiceFlow,
  textLooksLikeInvoicePaymentRecordingIntent,
} from './invoice-chat-intent';

describe('isExplicitNewInvoiceCreationMessage', () => {
  it('matches create an invoice for …', () => {
    expect(
      isExplicitNewInvoiceCreationMessage(
        'Create an invoice for Haret LLC, 8 Boots at $500 each, due 17th April 2026'
      )
    ).toBe(true);
  });

  it('does not match bare line items without create invoice for', () => {
    expect(isExplicitNewInvoiceCreationMessage('8 Boots at $500 each')).toBe(false);
  });
});

describe('draft reset intents', () => {
  it('bare “Create an Invoice” resets draft', () => {
    expect(isBareGenericCreateInvoiceMessage('Create an Invoice')).toBe(true);
    expect(isBareGenericCreateInvoiceMessage('Create an Invoice!')).toBe(true);
    expect(shouldResetDraftForNewInvoiceIntent('Create an Invoice')).toBe(true);
  });

  it('Company B after Company A: explicit create for … resets', () => {
    expect(
      shouldResetDraftForNewInvoiceIntent(
        'Create an invoice for Haret LLC, 8 Boots at $500 each'
      )
    ).toBe(true);
  });

  it('invoice for … lead-in resets', () => {
    expect(shouldResetDraftForNewInvoiceIntent('Invoice for Acme Ltd, 1 item at $10')).toBe(true);
  });
});

describe('payment recording vs create-invoice routing', () => {
  it('recognizes mark invoice as paid as payment intent', () => {
    expect(textLooksLikeInvoicePaymentRecordingIntent('Mark invoice as paid')).toBe(true);
    expect(textLooksLikeCreateInvoiceFlow('Mark invoice as paid')).toBe(false);
  });

  it('add payment for invoice … is not create-invoice (add … invoice)', () => {
    expect(textLooksLikeInvoicePaymentRecordingIntent('add payment for invoice INV-2001')).toBe(true);
    expect(textLooksLikeCreateInvoiceFlow('add payment for invoice INV-2001')).toBe(false);
  });

  it('still treats create invoice … as new-invoice flow', () => {
    expect(textLooksLikeInvoicePaymentRecordingIntent('Create an invoice for Acme')).toBe(false);
    expect(textLooksLikeCreateInvoiceFlow('Create an invoice for Acme')).toBe(true);
  });
});
