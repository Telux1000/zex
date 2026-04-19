import { describe, expect, it } from 'vitest';
import { emptyInvoiceWizardDraft } from './draft';
import {
  computeMissingFields,
  deriveCustomerResolutionState,
  getNextMissingInvoiceField,
  resolveWizardStep,
} from './state-machine';

describe('computeMissingFields customer resolution before items', () => {
  it('requires customer_pick when name is set but customer is not linked', () => {
    const draft = {
      ...emptyInvoiceWizardDraft(),
      customerName: 'Young Ltd',
      isNewCustomer: false,
      customerId: null,
      items: [],
    };
    const missing = computeMissingFields(draft);
    expect(missing[0]).toBe('customer_pick');
    expect(missing).not.toContain('items');
    expect(getNextMissingInvoiceField(draft)).toBe('customer_pick');
  });

  it('does not ask for items until customerId is set', () => {
    const draft = {
      ...emptyInvoiceWizardDraft(),
      customerName: 'Young Ltd',
      isNewCustomer: false,
      customerId: null,
    };
    expect(computeMissingFields(draft).includes('items')).toBe(false);
  });

  it('allows items after customer is linked', () => {
    const draft = {
      ...emptyInvoiceWizardDraft(),
      customerName: 'Young Ltd',
      isNewCustomer: false,
      customerId: 'cust-1',
      items: [],
    };
    expect(computeMissingFields(draft)).toContain('items');
  });
});

describe('deriveCustomerResolutionState', () => {
  it('maps exact auto-link and confirmation phases', () => {
    expect(
      deriveCustomerResolutionState(
        { ...emptyInvoiceWizardDraft(), customerId: 'x', customerName: 'Acme' },
        { customerNeedsDisambiguation: false, exactAutoLinkedThisTurn: true }
      )
    ).toBe('customer_exact_match');
    expect(
      deriveCustomerResolutionState(
        { ...emptyInvoiceWizardDraft(), customerId: 'x', customerName: 'Acme' },
        { customerNeedsDisambiguation: false, exactAutoLinkedThisTurn: false }
      )
    ).toBe('customer_resolved');
    expect(
      deriveCustomerResolutionState(
        { ...emptyInvoiceWizardDraft(), customerName: 'Y', isNewCustomer: false },
        { customerNeedsDisambiguation: true, exactAutoLinkedThisTurn: false }
      )
    ).toBe('customer_needs_confirmation');
    expect(
      deriveCustomerResolutionState(
        { ...emptyInvoiceWizardDraft(), isNewCustomer: true },
        { customerNeedsDisambiguation: false, exactAutoLinkedThisTurn: false }
      )
    ).toBe('customer_new_required');
  });
});

describe('resolveWizardStep customer resolution', () => {
  it('stays on CHECK_CUSTOMER when customer pick UI lock is on (must not jump to COLLECT_ITEMS)', () => {
    const draft = {
      ...emptyInvoiceWizardDraft(),
      customerName: 'Young Ltd',
      isNewCustomer: false,
      customerId: null,
    };
    expect(
      resolveWizardStep(draft, {
        customerNeedsDisambiguation: true,
        assistantCustomerEditLock: true,
      })
    ).toBe('CHECK_CUSTOMER');
  });
});
