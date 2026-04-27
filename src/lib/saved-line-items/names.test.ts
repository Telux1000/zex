import { describe, expect, it } from 'vitest';
import { normalizeLineItemName } from './names';

describe('normalizeLineItemName', () => {
  it('trims, lowercases, collapses spaces', () => {
    expect(normalizeLineItemName('  Design  work  ')).toBe('design work');
  });
});
