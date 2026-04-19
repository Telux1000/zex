import { describe, expect, it } from 'vitest';
import { emptyInvoiceWizardDraft } from './draft';
import { resolveWizardStep } from './state-machine';

describe('resolveWizardStep create-customer continuity', () => {
  it('keeps phone onboarding when isNewCustomer and email set but display name missing', () => {
    const draft = {
      ...emptyInvoiceWizardDraft(),
      isNewCustomer: true,
      customerName: '',
      customerEmail: 'haret@aoaz.org',
      newCustomerOnboardSubstep: 'phone' as const,
      newCustomerOptionalStepDone: false,
    };
    expect(
      resolveWizardStep(draft, { customerNeedsDisambiguation: false })
    ).toBe('COLLECT_NEW_CUSTOMER_PHONE');
  });

  it('asks for email first when isNewCustomer and email missing (even without display name)', () => {
    const draft = {
      ...emptyInvoiceWizardDraft(),
      isNewCustomer: true,
      customerName: '',
      customerEmail: '',
      newCustomerOptionalStepDone: false,
    };
    expect(resolveWizardStep(draft, { customerNeedsDisambiguation: false })).toBe('CREATE_CUSTOMER');
  });

  it('uses GET_CUSTOMER only when not in new-customer flow and name missing', () => {
    const draft = {
      ...emptyInvoiceWizardDraft(),
      isNewCustomer: false,
      customerName: '',
      customerEmail: '',
    };
    expect(resolveWizardStep(draft, { customerNeedsDisambiguation: false })).toBe('GET_CUSTOMER');
  });
});
