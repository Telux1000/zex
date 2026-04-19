import { describe, expect, it } from 'vitest';
import { resolveInvoiceAssistantIntent } from '@/lib/invoices/assistant-invoice-resolve-intent';

describe('resolveInvoiceAssistantIntent — status_aggregate', () => {
  it('counts partially paid invoices without customer scope', () => {
    expect(
      resolveInvoiceAssistantIntent('how many partially paid invoices do i have?')
    ).toEqual({
      type: 'status_aggregate',
      mode: 'count',
      filter: 'partially_paid',
    });
  });

  it('counts unpaid / overdue / paid', () => {
    expect(resolveInvoiceAssistantIntent('how many unpaid invoices do I have')).toEqual({
      type: 'status_aggregate',
      mode: 'count',
      filter: 'unpaid',
    });
    expect(resolveInvoiceAssistantIntent('number of overdue invoices')).toEqual({
      type: 'status_aggregate',
      mode: 'count',
      filter: 'overdue',
    });
    expect(resolveInvoiceAssistantIntent('how many paid invoices do i have')).toEqual({
      type: 'status_aggregate',
      mode: 'count',
      filter: 'paid',
    });
  });

  it('does not treat customer-scoped queries as business-wide aggregates', () => {
    expect(resolveInvoiceAssistantIntent('how many unpaid invoices for Acme')).not.toEqual(
      expect.objectContaining({ type: 'status_aggregate' })
    );
  });

  it('list / which / how much modes', () => {
    expect(resolveInvoiceAssistantIntent('list my partially paid invoices')).toEqual({
      type: 'status_aggregate',
      mode: 'list',
      filter: 'partially_paid',
    });
    expect(resolveInvoiceAssistantIntent('which invoices are overdue')).toEqual({
      type: 'status_aggregate',
      mode: 'list',
      filter: 'overdue',
    });
    expect(
      resolveInvoiceAssistantIntent('how much balance is on my partially paid invoices')
    ).toEqual({
      type: 'status_aggregate',
      mode: 'total',
      filter: 'partially_paid',
    });
  });

  it('leaves time-scoped paid counts to paid_in_period', () => {
    expect(resolveInvoiceAssistantIntent('how many invoices paid this week')).toMatchObject({
      type: 'paid_in_period',
      period: { kind: 'this_week' },
      presentation: 'count',
    });
  });
});
