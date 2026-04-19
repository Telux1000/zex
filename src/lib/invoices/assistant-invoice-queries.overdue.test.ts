import { describe, expect, it, vi } from 'vitest';
import { aggregateAssistantInvoiceInsights } from '@/lib/invoices/assistant-invoice-queries';

vi.mock('@/lib/invoices/dashboard-invoice-overdue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invoices/dashboard-invoice-overdue')>();
  return {
    ...actual,
    loadDashboardOverdueSnapshot: vi.fn(),
  };
});

import { loadDashboardOverdueSnapshot } from '@/lib/invoices/dashboard-invoice-overdue';

describe('aggregateAssistantInvoiceInsights overdue parity', () => {
  it('uses canonical dashboard overdue snapshot for total_overdue', async () => {
    vi.mocked(loadDashboardOverdueSnapshot).mockResolvedValue({
      invoiceCount: 3,
      totalBase: 245.5,
      byCurrency: [{ currency: 'USD', amount: 245.5 }],
    });

    const supabase = {
      from: () => {
        throw new Error('should not query invoices directly for total_overdue');
      },
    } as any;

    const out = await aggregateAssistantInvoiceInsights(supabase, 'biz_1', {
      metric: 'total_overdue',
      reportingCurrency: 'usd',
      workspaceTimezone: 'UTC',
    });

    expect(out).toEqual({ total: 245.5, currency: 'USD', count: 3 });
    expect(loadDashboardOverdueSnapshot).toHaveBeenCalledOnce();
  });
});

