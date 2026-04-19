import { describe, it, expect } from 'vitest';
import { emptyInvoiceWizardDraft, mergeWizardAiExtractIntoDraft } from './draft';
import { summarizeWizardTurnDelta } from './wizard-assistant-turn';
import type { WizardAiExtract } from './wizard-ai-extract';

describe('mergeWizardAiExtractIntoDraft', () => {
  it('does not merge line items until a customer is linked', () => {
    const out = mergeWizardAiExtractIntoDraft(emptyInvoiceWizardDraft(), {
      customer_name: 'Acme',
      items: [{ name: 'Chairs', quantity: 4, unit_price: 100 }],
    } as WizardAiExtract);
    expect(out.items).toHaveLength(0);
    expect(out.customerName).toBe('Acme');
  });

  it('appends new line items instead of replacing the whole list', () => {
    const linked = { ...emptyInvoiceWizardDraft(), customerId: 'c-test' };
    const base = mergeWizardAiExtractIntoDraft(linked, {
      customer_name: 'Acme',
      items: [{ name: 'Chairs', quantity: 4, unit_price: 100 }],
    } as WizardAiExtract);
    expect(base.items).toHaveLength(1);
    const next = mergeWizardAiExtractIntoDraft(base, {
      items: [{ name: 'Tables', quantity: 2, unit_price: 50 }],
    } as WizardAiExtract);
    expect(next.items).toHaveLength(2);
    expect(next.items[0]!.name).toBe('Chairs');
    expect(next.items[1]!.name).toBe('Tables');
    expect(next.customerName).toBe('Acme');
  });
});

describe('summarizeWizardTurnDelta', () => {
  it('does not mention added lines before a customer is linked', () => {
    const before = emptyInvoiceWizardDraft();
    const after = {
      ...before,
      customerName: 'Acme',
      items: [{ name: 'Cars', quantity: 5, unit_price: 0, unit_label: 'item' }],
    };
    const s = summarizeWizardTurnDelta(before, after);
    expect(s ?? '').not.toMatch(/Added/i);
    expect(s ?? '').not.toMatch(/Customer set/i);
  });

  it('describes multiple added items in one sentence', () => {
    const before = { ...emptyInvoiceWizardDraft(), customerId: 'c1' };
    const after = mergeWizardAiExtractIntoDraft(
      mergeWizardAiExtractIntoDraft(before, {
        items: [{ name: 'Blue Cap', quantity: 5, unit_price: 1200 }],
      } as WizardAiExtract),
      {
        items: [{ name: 'Shoes', quantity: 6, unit_price: 50 }],
      } as WizardAiExtract
    );
    const s = summarizeWizardTurnDelta(before, after);
    expect(s).toContain('Added 2 lines');
    expect(s).toContain('Blue Cap');
    expect(s).toContain('Shoes');
  });
});
