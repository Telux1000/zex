import { describe, expect, it } from 'vitest';
import {
  buildAnonymizedCustomerPatch,
  canRestoreCustomerState,
  evaluateHardDeleteDecision,
  hasFinancialHistory,
  type FinancialHistorySnapshot,
} from '@/lib/customers/customer-lifecycle';

function emptySnapshot(): FinancialHistorySnapshot {
  return {
    invoiceCount: 0,
    paidInvoiceCount: 0,
    paymentCount: 0,
    subscriptionHistoryCount: 0,
    activeSubscriptionCount: 0,
    creditNoteCount: 0,
    customerBalanceRecordCount: 0,
    disputeRefundTaxRecordCount: 0,
    financialAuditLogCount: 0,
    linkedStripeBillingObjectCount: 0,
  };
}

describe('customer hard delete policy', () => {
  it('customer with no invoices => hard delete allowed', () => {
    const decision = evaluateHardDeleteDecision(emptySnapshot());
    expect(decision.allowed).toBe(true);
    expect(decision.blockers).toEqual([]);
  });

  it('customer with draft invoice => hard delete blocked', () => {
    const decision = evaluateHardDeleteDecision({
      ...emptySnapshot(),
      invoiceCount: 1,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain('invoice_history');
  });

  it('customer with paid invoice => hard delete blocked', () => {
    const decision = evaluateHardDeleteDecision({
      ...emptySnapshot(),
      invoiceCount: 1,
      paidInvoiceCount: 1,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain('paid_invoice_history');
  });

  it('customer with canceled subscription history => hard delete blocked', () => {
    const decision = evaluateHardDeleteDecision({
      ...emptySnapshot(),
      subscriptionHistoryCount: 1,
      activeSubscriptionCount: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain('subscription_history');
  });

  it('customer with only profile and no billing objects => delete allowed', () => {
    const snapshot = emptySnapshot();
    expect(hasFinancialHistory(snapshot)).toBe(false);
    expect(evaluateHardDeleteDecision(snapshot).allowed).toBe(true);
  });
});

describe('archive and anonymize behavior', () => {
  it('archive keeps billing references intact by policy', () => {
    const decision = evaluateHardDeleteDecision({
      ...emptySnapshot(),
      invoiceCount: 2,
      paymentCount: 1,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Archive or anonymize');
  });

  it('anonymize removes pii but preserves financial references', () => {
    const patch = buildAnonymizedCustomerPatch({
      alias: 'Redacted C0001',
      actorUserId: 'user-1',
      nowIso: '2026-04-20T00:00:00.000Z',
    });
    expect(patch.email).toBeNull();
    expect(patch.phone).toBeNull();
    expect(patch.address_line1).toBeNull();
    expect(patch.name).toBe('Redacted C0001');
    expect(patch.company).toBe('Redacted C0001');
    expect(patch.is_active).toBe(false);
  });

  it('anonymized customers are not restorable', () => {
    expect(canRestoreCustomerState('2026-04-20T00:00:00.000Z')).toBe(false);
    expect(canRestoreCustomerState(null)).toBe(true);
  });
});
