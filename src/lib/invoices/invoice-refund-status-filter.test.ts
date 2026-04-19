import { describe, expect, it } from 'vitest';
import { assistantInvoiceRowMatchesStatusFilter } from '@/lib/invoices/assistant-invoice-queries';
import { deriveInvoiceStatus } from '@/lib/invoices/status';

function row(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    status: 'sent',
    total: 100,
    amount_paid: 0,
    balance_due: 100,
    total_refunded: 0,
    ...partial,
  };
}

describe('deriveInvoiceStatus — refunds', () => {
  it('returns refunded when cumulative refunds cover gross paid (no receivable)', () => {
    expect(
      deriveInvoiceStatus({
        status: 'partially_paid',
        total: 100,
        amount_paid: 100,
        total_refunded: 100,
      })
    ).toBe('refunded');
  });

  it('returns partially_refunded when net retained and balance are both positive', () => {
    expect(
      deriveInvoiceStatus({
        status: 'partially_paid',
        total: 100,
        amount_paid: 80,
        total_refunded: 30,
      })
    ).toBe('partially_refunded');
  });

  it('returns partially_paid when there is balance but no refunds', () => {
    expect(
      deriveInvoiceStatus({
        status: 'sent',
        total: 100,
        amount_paid: 40,
        total_refunded: 0,
      })
    ).toBe('partially_paid');
  });

  it('returns paid when balance is zero and net retained after refunds is positive', () => {
    expect(
      deriveInvoiceStatus({
        status: 'sent',
        total: 100,
        amount_paid: 100,
        total_refunded: 0,
      })
    ).toBe('paid');
  });

  it('preserves voided / cancelled', () => {
    expect(deriveInvoiceStatus({ status: 'voided', total: 100, amount_paid: 50, total_refunded: 0 })).toBe(
      'voided'
    );
    expect(
      deriveInvoiceStatus({ status: 'cancelled', total: 100, amount_paid: 50, total_refunded: 0 })
    ).toBe('cancelled');
  });
});

describe('assistantInvoiceRowMatchesStatusFilter — unpaid & partial lists', () => {
  it('excludes fully refunded rows from unpaid (no receivable)', () => {
    expect(
      assistantInvoiceRowMatchesStatusFilter(
        row({
          status: 'partially_paid',
          amount_paid: 100,
          total_refunded: 100,
        }),
        'unpaid'
      )
    ).toBe(false);
  });

  it('excludes unpaid when derived balance is zero even if DB status still looks open', () => {
    expect(
      assistantInvoiceRowMatchesStatusFilter(
        row({
          status: 'sent',
          amount_paid: 100,
          total_refunded: 100,
          balance_due: 50,
        }),
        'unpaid'
      )
    ).toBe(false);
  });

  it('includes partially_refunded rows with remaining balance in unpaid', () => {
    expect(
      assistantInvoiceRowMatchesStatusFilter(
        row({
          status: 'partially_paid',
          amount_paid: 80,
          total_refunded: 30,
        }),
        'unpaid'
      )
    ).toBe(true);
  });

  it('treats partially_refunded like partial receivables for partially_paid filter', () => {
    expect(
      assistantInvoiceRowMatchesStatusFilter(
        row({
          status: 'partially_paid',
          amount_paid: 80,
          total_refunded: 30,
        }),
        'partially_paid'
      )
    ).toBe(true);
  });

  it('does not use partially_paid filter for plain sent with no payments', () => {
    expect(
      assistantInvoiceRowMatchesStatusFilter(
        row({
          status: 'sent',
          amount_paid: 0,
          total_refunded: 0,
        }),
        'partially_paid'
      )
    ).toBe(false);
  });
});
