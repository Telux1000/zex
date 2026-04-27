import { describe, expect, it } from 'vitest';
import { normalizeCountryCode } from '@/lib/location';
import {
  dedupeWizardAddressFields,
  finalizeWizardNewCustomerExtractFields,
  formatWizardCustomerAddressSummary,
  sanitizeWizardContactVsPhone,
  tryInferCountryFromAddressText,
} from './new-customer-onboarding';
import { emptyInvoiceWizardDraft } from './draft';
import type { InvoiceWizardDraft } from './types';

describe('normalizeCountryCode (US aliases)', () => {
  it('maps United States and USA to US', () => {
    expect(normalizeCountryCode('United States')).toBe('US');
    expect(normalizeCountryCode('USA')).toBe('US');
    expect(normalizeCountryCode('us')).toBe('US');
  });
});

describe('dedupeWizardAddressFields', () => {
  it('clears duplicate customerAddress when same as line1', () => {
    const line = '1958 E Brown Rd, Mesa, Arizona, United States';
    const d = {
      ...emptyInvoiceWizardDraft(),
      isNewCustomer: true,
      customerAddressLine1: line,
      customerAddress: line,
    };
    const out = dedupeWizardAddressFields(d);
    expect(out.customerAddressLine1).toBe(line);
    expect(out.customerAddress).toBeNull();
  });
});

describe('tryInferCountryFromAddressText', () => {
  it('infers US from trailing United States in a single line', () => {
    const line = '1958 E Brown Rd, Mesa, Arizona, United States';
    const d = {
      ...emptyInvoiceWizardDraft(),
      isNewCustomer: true,
      customerAddressLine1: line,
      customerAddress: null,
    };
    const out = tryInferCountryFromAddressText(d);
    expect(out.customerCountry).toBe('US');
  });
});

describe('formatWizardCustomerAddressSummary', () => {
  it('does not duplicate line1 and customerAddress', () => {
    const line = '1958 E Brown Rd, Mesa, Arizona, United States';
    const d = {
      ...emptyInvoiceWizardDraft(),
      customerAddressLine1: line,
      customerAddress: line,
    };
    expect(formatWizardCustomerAddressSummary(d)).toBe(line);
  });
});

describe('sanitizeWizardContactVsPhone', () => {
  it('clears contact when it matches phone digits', () => {
    const d = {
      ...emptyInvoiceWizardDraft(),
      isNewCustomer: true,
      customerPhone: '(480) 555-0100',
      customerContactName: '480-555-0100',
    };
    const out = sanitizeWizardContactVsPhone(d);
    expect(out.customerContactName).toBeNull();
    expect(out.customerPhone).toBe(d.customerPhone);
  });

  it('moves phone-like contact into phone when phone empty', () => {
    const d = {
      ...emptyInvoiceWizardDraft(),
      isNewCustomer: true,
      customerPhone: null,
      customerContactName: '4805550100',
    };
    const out = sanitizeWizardContactVsPhone(d);
    expect(out.customerContactName).toBeNull();
    expect(out.customerPhone).toBe('4805550100');
  });
});

describe('finalizeWizardNewCustomerExtractFields', () => {
  it('dedupes, strips phone-as-contact, and infers country', () => {
    const line = '1958 E Brown Rd, Mesa, Arizona, United States';
    let d: InvoiceWizardDraft = {
      ...emptyInvoiceWizardDraft(),
      isNewCustomer: true,
      customerEmail: 'a@b.co',
      customerPhone: '4805550100',
      customerContactName: '4805550100',
      customerAddressLine1: line,
      customerAddress: line,
    };
    d = finalizeWizardNewCustomerExtractFields(d);
    expect(d.customerCountry).toBe('US');
    expect(d.customerContactName).toBeNull();
    expect(d.customerAddress).toBeNull();
  });
});
