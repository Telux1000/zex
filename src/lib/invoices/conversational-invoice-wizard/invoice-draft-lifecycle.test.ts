import { describe, it, expect } from 'vitest';
import { emptyInvoiceWizardDraft } from './draft';
import { deriveInvoiceDraftLifecyclePhase } from './invoice-draft-lifecycle';

describe('deriveInvoiceDraftLifecyclePhase', () => {
  it('idle for empty draft', () => {
    expect(
      deriveInvoiceDraftLifecyclePhase(emptyInvoiceWizardDraft(), {
        wizardStep: 'GET_CUSTOMER',
        hasSuccessInvoiceBanner: false,
      })
    ).toBe('idle');
  });

  it('draft_created when success banner is showing', () => {
    expect(
      deriveInvoiceDraftLifecyclePhase(emptyInvoiceWizardDraft(), {
        wizardStep: 'SUCCESS',
        hasSuccessInvoiceBanner: true,
      })
    ).toBe('draft_created');
  });
});
