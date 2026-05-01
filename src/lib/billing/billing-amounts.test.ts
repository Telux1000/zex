import { describe, expect, it } from 'vitest';
import { paystackSubunitsToMajor } from '@/lib/billing/billing-amounts';

describe('paystackSubunitsToMajor', () => {
  it('converts NGN kobo to naira', () => {
    expect(paystackSubunitsToMajor(19_000, 'NGN')).toBe(190);
  });
  it('leaves JPY as-is', () => {
    expect(paystackSubunitsToMajor(1000, 'JPY')).toBe(1000);
  });
});
