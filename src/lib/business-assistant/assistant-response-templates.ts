/**
 * Standard assistant response shapes (total / count / list / breakdown).
 * Implementations live in `financial-assistant-copy.ts` and invoice pipeline copy.
 */

export const ASSISTANT_RESPONSE_TEMPLATES = {
  total_amount: {
    description: 'Bold title, amount, period (one line each) + disclaimer + drill-down text',
    builders: ['revenueCollectedSummaryStructured'] as const,
  },
  count: {
    description: 'Single metric title + count row + optional follow-up line',
    builders: [
      'overdueCountBody',
      'partiallyPaidInvoiceCountBody',
      'invoicesIssuedBody',
    ] as const,
  },
  list: {
    description: 'Titled list lines + period when relevant',
    builders: ['revenuePeriodInvoiceListPrompt'] as const,
  },
  breakdown: {
    description: 'Dimension title + sorted rows + period + progressive replies',
    builders: [
      'buildRevenueCustomerBreakdownResponse',
      'buildRevenueDayBreakdownResponse',
      'buildRevenueInvoiceBreakdownResponse',
    ] as const,
  },
} as const;
