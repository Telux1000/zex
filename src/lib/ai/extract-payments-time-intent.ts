import { z } from 'zod';
import type { PaymentsNaturalRangeSpec } from '@/lib/analytics/payments-received-time-range';
import { getOpenAI } from '@/lib/ai/openai-server';
import { PAYMENTS_TIME_INTENT_SYSTEM, paymentsTimeIntentUser } from '@/lib/ai/prompts/payments-time-intent';

const Weekday = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const RangeSpecSchema: z.ZodType<PaymentsNaturalRangeSpec> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('today') }),
  z.object({ kind: z.literal('yesterday') }),
  z.object({ kind: z.literal('this_week') }),
  z.object({ kind: z.literal('last_week') }),
  z.object({ kind: z.literal('this_month') }),
  z.object({ kind: z.literal('last_month') }),
  z.object({
    kind: z.literal('rolling_days'),
    days: z.number().int().min(1).max(366),
  }),
  z.object({
    kind: z.literal('last_named_weekday'),
    weekday: Weekday,
  }),
  z.object({
    kind: z.literal('explicit_calendar_range'),
    start: z.string().min(1),
    end: z.string().min(1),
    year: z.number().int().min(2000).max(2100).optional(),
  }),
]);

const OuterSchema = z.object({
  is_payments_received_question: z.boolean(),
  ambiguous: z.boolean(),
  ambiguity_note: z.string().nullable().optional(),
  range: z.unknown().nullable(),
});

export type PaymentsTimeIntentExtraction =
  | { status: 'not_applicable' }
  | { status: 'ambiguous'; note: string }
  | { status: 'ok'; range: PaymentsNaturalRangeSpec };

/**
 * Map natural language → validated structured range spec (no absolute dates).
 */
export async function extractPaymentsTimeIntent(question: string): Promise<PaymentsTimeIntentExtraction> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PAYMENTS_TIME_INTENT_SYSTEM },
      { role: 'user', content: paymentsTimeIntentUser(question) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { status: 'not_applicable' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'not_applicable' };
  }

  const outer = OuterSchema.safeParse(parsed);
  if (!outer.success || !outer.data.is_payments_received_question) {
    return { status: 'not_applicable' };
  }

  if (outer.data.ambiguous) {
    const note =
      typeof outer.data.ambiguity_note === 'string' && outer.data.ambiguity_note.trim()
        ? outer.data.ambiguity_note.trim()
        : 'That date range is ambiguous. Try naming a specific period (e.g. past 14 days, this month, or March 1 to March 15, 2026).';
    return { status: 'ambiguous', note };
  }

  const rangeParsed = RangeSpecSchema.safeParse(outer.data.range);
  if (!rangeParsed.success) {
    return {
      status: 'ambiguous',
      note:
        'I could not reliably interpret the time period. Try rephrasing with a clear range (today, this week, past 14 days, last Friday, or explicit dates).',
    };
  }

  return { status: 'ok', range: rangeParsed.data };
}
