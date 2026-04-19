import { describe, expect, it } from 'vitest';
import { filterWizardExtractAgainstUserText } from './wizard-extract-guardrails';
import type { WizardAiExtract } from './wizard-ai-extract';

describe('filterWizardExtractAgainstUserText', () => {
  it('drops a hallucinated Service line when the user only named Cars', () => {
    const ex = {
      items: [
        { name: 'Cars', quantity: 5, unit_price: 800 },
        { name: 'Service', quantity: 1, unit_price: 0 },
      ],
    } as unknown as WizardAiExtract;
    const out = filterWizardExtractAgainstUserText(ex, 'Invoice Young Ltd for 5 Cars at 800 each');
    expect(out.items).toHaveLength(1);
    expect(out.items![0]!.name).toBe('Cars');
  });

  it('drops due_date from the model when the user gave no schedule wording', () => {
    const ex = { due_date: '2026-04-20', items: [] } as unknown as WizardAiExtract;
    const out = filterWizardExtractAgainstUserText(ex, '5 chairs at 12 dollars');
    expect(out.due_date).toBeUndefined();
  });

  it('keeps due_date when the user said due', () => {
    const ex = {
      due_date: '2026-04-15',
      items: [{ name: 'Logo', quantity: 1, unit_price: 500 }],
    } as unknown as WizardAiExtract;
    const out = filterWizardExtractAgainstUserText(ex, 'Logo $500 due April 15');
    expect(String(out.due_date ?? '').length).toBeGreaterThan(0);
  });
});
