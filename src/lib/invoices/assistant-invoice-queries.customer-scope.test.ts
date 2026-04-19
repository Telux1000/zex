import { describe, expect, it } from 'vitest';
import {
  collectedRevenueCustomerGroupKeyFromInvoiceRow,
  customerGroupKeySetForScope,
} from '@/lib/invoices/assistant-invoice-queries';

describe('customer scope for collected-revenue drill-down', () => {
  it('builds stable id: and name: group keys', () => {
    expect(
      collectedRevenueCustomerGroupKeyFromInvoiceRow({
        customer_id: 'c-1',
        customer_name: 'Lava LLC',
      })
    ).toBe('id:c-1');
    expect(
      collectedRevenueCustomerGroupKeyFromInvoiceRow({
        customer_id: null,
        customer_name: 'Lava LLC',
      })
    ).toBe('name:lava llc');
    expect(
      collectedRevenueCustomerGroupKeyFromInvoiceRow({
        customer_id: '',
        customer_name: null,
      })
    ).toBe('name:__none__');
  });

  it('builds a scope set from parent keys', () => {
    const s = customerGroupKeySetForScope(['id:a', 'name:acme', '  ']);
    expect(s?.has('id:a')).toBe(true);
    expect(s?.has('name:acme')).toBe(true);
    expect(customerGroupKeySetForScope(null)).toBeNull();
    expect(customerGroupKeySetForScope([])).toBeNull();
  });
});
