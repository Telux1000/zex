import { describe, expect, it } from 'vitest';
import { formatAddressBlockLines } from './address-block-format';

describe('formatAddressBlockLines', () => {
  it('groups city line with formatted country', () => {
    const lines = formatAddressBlockLines({
      line1: '17 penta Street',
      city: 'Hammersmith',
      state: 'London',
      country: 'United Kingdom of Great Britain and Northern Ireland',
    });
    expect(lines[0]).toBe('17 penta Street');
    expect(lines[1]).toBe('Hammersmith, London, United Kingdom');
  });
});
