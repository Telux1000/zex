import { describe, expect, it } from 'vitest';
import { formatCountryDisplayName } from './country-display';

describe('formatCountryDisplayName', () => {
  it('shortens United Kingdom of Great Britain and Northern Ireland', () => {
    expect(formatCountryDisplayName('United Kingdom of Great Britain and Northern Ireland')).toBe('United Kingdom');
  });
  it('shortens United States of America', () => {
    expect(formatCountryDisplayName('United States of America')).toBe('United States');
  });
  it('maps Russian Federation', () => {
    expect(formatCountryDisplayName('Russian Federation')).toBe('Russia');
  });
  it('maps United Arab Emirates to UAE', () => {
    expect(formatCountryDisplayName('United Arab Emirates')).toBe('UAE');
  });
  it('preserves unknown and short values', () => {
    expect(formatCountryDisplayName('Ireland')).toBe('Ireland');
    expect(formatCountryDisplayName('  GB  ')).toBe('GB');
  });
});
