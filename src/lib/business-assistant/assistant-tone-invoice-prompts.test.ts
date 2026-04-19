import { describe, it, expect } from 'vitest';
import { buildCombinedInvoiceMissingPrompt } from './assistant-tone';

describe('buildCombinedInvoiceMissingPrompt (slot priority)', () => {
  it('returns null when customer is missing so we ask “Who’s this invoice for?” first', () => {
    expect(
      buildCombinedInvoiceMissingPrompt(['customer', 'items', 'due_date'])
    ).toBeNull();
  });

  it('returns null when due date is still missing (ask items, then due date separately)', () => {
    expect(buildCombinedInvoiceMissingPrompt(['items', 'due_date'])).toBeNull();
  });

  it('still combines line refinements (e.g. quantity + pricing)', () => {
    const p = buildCombinedInvoiceMissingPrompt(['quantity', 'pricing']);
    expect(p).toBeTruthy();
    expect(p).toContain('quantity');
    expect(p).toContain('amount');
  });
});
