import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import { parseAssistantStructuredQuery } from '@/lib/business-assistant/assistant-structured-intent';
import type { AssistantIntentCategory } from './types';

/**
 * Classify user text into a business domain for routing.
 * Delegates to the structured intent parser (semantic layers + same precedence as legacy keyword rules).
 */
export function detectAssistantIntentCategory(
  text: string,
  metricSession?: AssistantMetricSessionContext | null
): AssistantIntentCategory {
  return parseAssistantStructuredQuery(text, metricSession ?? null).query.routeCategory;
}

export { parseAssistantStructuredQuery } from '@/lib/business-assistant/assistant-structured-intent';
