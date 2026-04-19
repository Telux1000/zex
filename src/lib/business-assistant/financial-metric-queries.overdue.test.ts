import { describe, expect, it, vi, beforeEach } from 'vitest';
import { aggregateOverdueInvoices } from '@/lib/business-assistant/financial-metric-queries';

vi.mock('@/lib/invoices/dashboard-invoice-overdue', () => ({
  loadDashboardOverdueSnapshot: vi.fn(),
}));

import { loadDashboardOverdueSnapshot } from '@/lib/invoices/dashboard-invoice-overdue';

describe('aggregateOverdueInvoices', () => {
  beforeEach(() => {
    vi.mocked(loadDashboardOverdueSnapshot).mockReset();
  });

  it('maps overdue values from dashboard snapshot', async () => {
    vi.mocked(loadDashboardOverdueSnapshot).mockResolvedValue({
      invoiceCount: 2,
      totalBase: 120,
      byCurrency: [{ currency: 'USD', amount: 120 }],
    });

    const agg = await aggregateOverdueInvoices({} as any, 'b1', {
      workspaceTimezone: 'UTC',
      baseCurrencyCode: 'USD',
    });
    expect(agg.invoiceCount).toBe(2);
    expect(agg.byCurrency).toEqual([{ currency: 'USD', amount: 120 }]);
  });
});

