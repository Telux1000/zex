import OpenAI from 'openai';
import {
  StructuredAnalyticsQuerySchema,
  type StructuredAnalyticsQuery,
} from '@/lib/analytics/structured-analytics-query.types';
import {
  FINANCIAL_ANALYTICS_ASSISTANT_SYSTEM,
  financialAnalyticsAssistantUser,
} from '@/lib/ai/prompts/financial-analytics-assistant';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Turn natural language into a validated structured analytics query (no SQL, no numbers).
 * Relative time stays as text; a resolver with the workspace TZ produces instants later.
 */
export async function extractStructuredAnalyticsQuery(
  question: string,
  options?: { workspaceTimezone?: string | null }
): Promise<StructuredAnalyticsQuery> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: FINANCIAL_ANALYTICS_ASSISTANT_SYSTEM },
      {
        role: 'user',
        content: financialAnalyticsAssistantUser(question, options?.workspaceTimezone ?? null),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.15,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return {
      ambiguous: true,
      clarification_question:
        'I could not parse that question. What metric (revenue, expenses, or transactions) and time range should we use?',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ambiguous: true,
      clarification_question: 'I could not read the question. Could you rephrase it more simply?',
    };
  }

  const result = StructuredAnalyticsQuerySchema.safeParse(parsed);
  if (!result.success) {
    return {
      ambiguous: true,
      clarification_question:
        'That question is a bit unclear. Do you want a total, a trend, or a breakdown—and for which period (e.g. this month)?',
    };
  }

  return result.data;
}
