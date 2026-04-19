import { describe, expect, it } from 'vitest';
import {
  buildCustomerLifecycleDisplayLabel,
  segmentInactiveCustomers,
  sortPreviouslyActiveByValueThenRecency,
} from '@/lib/business-assistant/customer-lifecycle-analytics';
import type { CustomerLifecycleRow } from '@/lib/business-assistant/customer-lifecycle-analytics';

function row(partial: Partial<CustomerLifecycleRow> & { customerId: string }): CustomerLifecycleRow {
  return {
    customerId: partial.customerId,
    name: partial.name ?? '',
    company: partial.company ?? null,
    email: partial.email ?? null,
    displayLabel:
      partial.displayLabel ??
      buildCustomerLifecycleDisplayLabel(partial.company ?? null, partial.name ?? null, partial.email ?? null),
    lastActivityMs: partial.lastActivityMs ?? null,
    hadRelationship: partial.hadRelationship ?? false,
    historicalInvoicedBase: partial.historicalInvoicedBase ?? 0,
  };
}

describe('buildCustomerLifecycleDisplayLabel', () => {
  it('prefers company, then name, then email', () => {
    expect(buildCustomerLifecycleDisplayLabel('Acme Ltd', 'Jane Doe', 'j@ac.me')).toBe('Acme Ltd');
    expect(buildCustomerLifecycleDisplayLabel(null, 'Jane Doe', 'j@ac.me')).toBe('Jane Doe');
    expect(buildCustomerLifecycleDisplayLabel('', '', 'j@ac.me')).toBe('j@ac.me');
  });

  it('replaces unnamed placeholder and empty cases', () => {
    expect(buildCustomerLifecycleDisplayLabel(null, 'Unnamed customer', null)).toBe('No name (customer record)');
    expect(buildCustomerLifecycleDisplayLabel(null, '', null)).toBe('No name (customer record)');
  });
});

describe('sortPreviouslyActiveByValueThenRecency', () => {
  it('orders by historical value desc then oldest activity', () => {
    const a = row({
      customerId: '1',
      company: 'Low',
      lastActivityMs: Date.now() - 40 * 24 * 3600 * 1000,
      hadRelationship: true,
      historicalInvoicedBase: 100,
    });
    const b = row({
      customerId: '2',
      company: 'High',
      lastActivityMs: Date.now() - 100 * 24 * 3600 * 1000,
      hadRelationship: true,
      historicalInvoicedBase: 500,
    });
    const c = row({
      customerId: '3',
      company: 'Mid',
      lastActivityMs: Date.now() - 200 * 24 * 3600 * 1000,
      hadRelationship: true,
      historicalInvoicedBase: 500,
    });
    const sorted = sortPreviouslyActiveByValueThenRecency([a, b, c]);
    expect(sorted.map((r) => r.customerId)).toEqual(['3', '2', '1']);
  });
});

describe('segmentInactiveCustomers', () => {
  it('splits previously active vs never active', () => {
    const { previouslyActive, neverActive } = segmentInactiveCustomers([
      row({ customerId: 'a', hadRelationship: true, historicalInvoicedBase: 10 }),
      row({ customerId: 'b', hadRelationship: false }),
    ]);
    expect(previouslyActive).toHaveLength(1);
    expect(neverActive).toHaveLength(1);
    expect(previouslyActive[0].customerId).toBe('a');
    expect(neverActive[0].customerId).toBe('b');
  });
});
