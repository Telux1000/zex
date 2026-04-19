import type Anthropic from '@anthropic-ai/sdk';

const periodProps = {
  period_key: {
    type: 'string',
    enum: [
      'today',
      'yesterday',
      'this_week',
      'last_week',
      'this_month',
      'last_month',
      'last_7_days',
      'last_14_days',
      'last_30_days',
      'last_90_days',
      'custom',
    ],
    description: 'Time window for the query',
  },
  start_date: { type: ['string', 'null'], description: 'YYYY-MM-DD when period_key is custom' },
  end_date: { type: ['string', 'null'], description: 'YYYY-MM-DD when period_key is custom' },
} as const;

export const BUSINESS_ASSISTANT_CLAUDE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_metric_summary',
    description:
      'Totals and counts from source-of-truth backend (payments, invoices). For collected_from_invoices, by_currency[] rows include breakdown_line (server-formatted) — echo those lines verbatim for currency breakdown; do not round FX equivalents to whole dollars.',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: [
            'collected_from_invoices',
            'unpaid_total',
            'overdue_total',
            'invoice_count',
            'paid_invoice_count',
            'partially_paid_invoice_count',
            'overdue_invoice_count',
          ],
        },
        ...periodProps,
        scope: { type: 'string', enum: ['all', 'customer'] },
        customer_id: { type: ['string', 'null'] },
        include_partial_payments: { type: 'boolean', description: 'For collected metrics; default true' },
        base_currency: { type: ['string', 'null'] },
      },
      required: ['metric', 'period_key', 'scope', 'include_partial_payments'],
    },
  },
  {
    name: 'get_metric_breakdown',
    description:
      'Grouped collected revenue / payments by dimension (customer, day, invoice, month, currency). For breakdown_dimension currency, by_currency rows include breakdown_line — copy verbatim (preserves cents on base FX).',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['collected_from_invoices'] },
        ...periodProps,
        breakdown_dimension: {
          type: 'string',
          enum: ['customer', 'day', 'month', 'invoice', 'currency'],
        },
        scope: { type: 'string', enum: ['all', 'customer'] },
        customer_id: { type: ['string', 'null'] },
        include_partial_payments: { type: 'boolean' },
        base_currency: { type: ['string', 'null'] },
      },
      required: ['metric', 'period_key', 'breakdown_dimension', 'scope', 'include_partial_payments'],
    },
  },
  {
    name: 'find_invoice',
    description: 'Resolve an invoice by reference (INV-00059, #59, 59).',
    input_schema: {
      type: 'object',
      properties: {
        invoice_reference: { type: 'string' },
      },
      required: ['invoice_reference'],
    },
  },
  {
    name: 'list_invoices',
    description:
      'List invoices with optional status and payment-date window. Each row includes invoice_total, amount_paid, balance_remaining, and derived status from stored invoice fields — use these for partially paid breakdowns (do not guess).',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Optional: paid | partially_paid | unpaid | overdue',
        },
        ...periodProps,
        customer_id: { type: ['string', 'null'] },
        limit: { type: 'number', description: 'Max rows, default 25, max 50' },
      },
      required: ['period_key'],
    },
  },
  {
    name: 'create_invoice_draft',
    description: 'User wants to start creating a new invoice in the composer.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Short note of what the user asked' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'update_invoice_draft',
    description: 'User wants to change fields on the in-progress invoice draft.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'find_customer',
    description:
      'Find customers by name or company for this workspace. Returns matching ids and display names — use when the user wants to view, edit, or open a customer record.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer or company name to search' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_customer',
    description: 'User wants to add a new customer from chat.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
    },
  },
];
