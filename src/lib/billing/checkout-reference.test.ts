import { describe, expect, it } from 'vitest';
import {
  subscriptionIdFromFlutterwaveTxRef,
  subscriptionIdFromPaystackReference,
} from '@/lib/billing/checkout-reference';

const SAMPLE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const COMPACT = 'a1b2c3d4e5f67890abcdef1234567890';

describe('checkout reference → subscription id', () => {
  it('parses Flutterwave tx_ref', () => {
    expect(subscriptionIdFromFlutterwaveTxRef(`zx_${COMPACT}`)).toBe(SAMPLE_UUID);
  });

  it('parses Paystack reference (legacy zx_ps_)', () => {
    expect(subscriptionIdFromPaystackReference(`zx_ps_${COMPACT}`)).toBe(SAMPLE_UUID);
  });

  it('parses Paystack reference (same ref as Flutterwave zx_)', () => {
    expect(subscriptionIdFromPaystackReference(`zx_${COMPACT}`)).toBe(SAMPLE_UUID);
  });

  it('rejects unknown prefixes', () => {
    expect(subscriptionIdFromFlutterwaveTxRef('bad_prefix')).toBeNull();
    expect(subscriptionIdFromPaystackReference('zx_')).toBeNull();
  });

  it('accepts uppercase hex in ref', () => {
    const upper = COMPACT.toUpperCase();
    expect(subscriptionIdFromFlutterwaveTxRef(`zx_${upper}`)).toBe(SAMPLE_UUID);
  });
});
