export type InsightsAskResult = {
  answer: string;
  supporting_facts?: string[];
};

export type InsightsGenerateResponse = {
  insights: Array<Record<string, unknown>>;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data && typeof data.error === 'string' && data.error) || 'AI request failed';
    throw new Error(message);
  }
  return data as T;
}

/**
 * Internal AI service for the frontend.
 * Provider routing is centralized here; the UI never needs to know.
 */
export type AiInsightsClientContext = {
  /** Dashboard range preset (`this_month` | `last_7_days` | `last_90_days`). */
  range?: string;
  /** IANA timezone from dashboard cookie (optional). */
  dashboardTz?: string | null;
};

export const AIServiceClient = {
  async askInsightsQuestion(
    args: { businessId: string; question: string } & AiInsightsClientContext
  ): Promise<InsightsAskResult> {
    const data = await postJson<{ answer?: string; supporting_facts?: unknown[] }>(
      '/api/ai/insights/ask',
      {
        question: args.question,
        business_id: args.businessId,
        ...(args.range != null ? { range: args.range } : {}),
        ...(args.dashboardTz ? { dashboard_tz: args.dashboardTz } : {}),
      }
    );
    return {
      answer: typeof data.answer === 'string' ? data.answer : '',
      supporting_facts: Array.isArray(data.supporting_facts)
        ? data.supporting_facts.map((x) => String(x))
        : [],
    };
  },

  async generateInsights(
    args: { businessId: string } & AiInsightsClientContext
  ): Promise<InsightsGenerateResponse> {
    const data = await postJson<InsightsGenerateResponse>('/api/ai/insights/generate', {
      business_id: args.businessId,
      ...(args.range != null ? { range: args.range } : {}),
      ...(args.dashboardTz ? { dashboard_tz: args.dashboardTz } : {}),
    });
    return data;
  },
};

