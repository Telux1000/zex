import { z } from 'zod';

/** What the user is measuring (ledger-level categories; execution layer maps to tables). */
export const AnalyticsMetricSchema = z.enum([
  'revenue',
  'expenses',
  'transactions',
  /** Both revenue-like and expense-like movement */
  'mixed',
  'unknown',
]);
export type AnalyticsMetric = z.infer<typeof AnalyticsMetricSchema>;

export const AnalyticsIntentSchema = z.enum([
  'total',
  'trend',
  'comparison',
  'breakdown',
  'ranking',
  'anomaly',
  'forecast',
  'drilldown',
]);
export type AnalyticsIntent = z.infer<typeof AnalyticsIntentSchema>;

/**
 * Time window as natural language only. A downstream resolver (with workspace/system IANA TZ)
 * turns this into absolute bounds — the model must not invent UTC timestamps.
 */
export const TimeRangeSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('relative'),
    /** e.g. "today", "last 7 days", "this month", "Q1 2025" */
    expression: z.string().min(1),
  }),
  z.object({
    kind: z.literal('unspecified'),
  }),
]);
export type TimeRangeSpec = z.infer<typeof TimeRangeSpecSchema>;

const ResolvedQuerySchema = z.object({
  ambiguous: z.literal(false),
  metric: AnalyticsMetricSchema,
  time_range: TimeRangeSpecSchema,
  intent: AnalyticsIntentSchema,
  /** Optional slice hints (customer name, category); no SQL or table names. */
  dimensions: z.array(z.string()).optional(),
});

const AmbiguousSchema = z.object({
  ambiguous: z.literal(true),
  clarification_question: z.string().min(1),
});

export const StructuredAnalyticsQuerySchema = z.discriminatedUnion('ambiguous', [
  ResolvedQuerySchema,
  AmbiguousSchema,
]);

export type StructuredAnalyticsQuery = z.infer<typeof StructuredAnalyticsQuerySchema>;
