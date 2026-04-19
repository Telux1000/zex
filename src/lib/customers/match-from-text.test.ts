import { describe, expect, it } from 'vitest';
import {
  dedupeMatchableCustomersById,
  disambiguateCustomerSuggestionLabels,
  matchCustomerFromText,
  type MatchableCustomer,
} from './match-from-text';

describe('disambiguateCustomerSuggestionLabels', () => {
  it('adds email when two options share the same label', () => {
    const out = disambiguateCustomerSuggestionLabels([
      { id: '1', label: 'Young Ltd', email: 'a@x.com' },
      { id: '2', label: 'Young Ltd', email: 'b@y.com' },
    ]);
    expect(out[0]!.label).toContain('a@x.com');
    expect(out[1]!.label).toContain('b@y.com');
  });
});

describe('dedupeMatchableCustomersById', () => {
  it('keeps first row per id', () => {
    const a: MatchableCustomer = { id: '1', company: 'Young Ltd' };
    const b: MatchableCustomer = { id: '1', company: 'Young Ltd' };
    expect(dedupeMatchableCustomersById([a, b])).toEqual([a]);
  });
});

describe('matchCustomerFromText', () => {
  it('dedupes duplicate ids before exact-match disambiguation', () => {
    const dup: MatchableCustomer = { id: 'x', company: 'Young Ltd' };
    const r = matchCustomerFromText('Young Ltd', [dup, dup]);
    expect(r.confidence).toBe('high');
    expect(r.match?.id).toBe('x');
    expect(r.matches).toHaveLength(1);
  });

  it('does not auto-select a single fuzzy/partial match — requires confirmation', () => {
    const c: MatchableCustomer = { id: 'a', company: 'Young Ltd Trading' };
    const r = matchCustomerFromText('Young Ltd', [c]);
    expect(r.confidence).toBe('medium');
    expect(r.match).toBeNull();
    expect(r.disambiguation).toBe('fuzzy_partial');
    expect(r.matches).toHaveLength(1);
  });
});
