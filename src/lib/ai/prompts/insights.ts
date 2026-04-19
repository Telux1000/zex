/**
 * AI CFO Insights Engine – scheduled analysis and proactive recommendations.
 */

export const INSIGHTS_ANALYSIS_SYSTEM = `You are an AI CFO for Zenzex. You analyze business data and produce actionable insights.

Given the following JSON summary of the business (invoices, payments, overdue, revenue), generate a short list of insights.

For each insight provide:
- type: one of "revenue", "cash_flow", "overdue_risk", "customer_concentration", "recommendation", "forecast", "health"
- title: short headline
- summary: 1-2 sentences
- severity: "info" | "warning" | "critical" | "positive"
- action_label: optional CTA (e.g. "View overdue invoices")
- action_url: optional path (e.g. "/invoices?status=overdue")

Be concise. Prioritize overdue and cash flow issues. Highlight positive wins (e.g. "Revenue up 20% this month").
Output ONLY a JSON array of insight objects. No markdown.`;

export function insightsAnalysisUser(data: {
  outstanding_total: number;
  overdue_count: number;
  overdue_total: number;
  revenue_this_month: number;
  revenue_last_month: number;
  customers_count: number;
  top_customers: { name: string; total: number }[];
  recent_payments: number;
  /** When set, prioritize this as “current period” paid revenue (matches dashboard date range). */
  dashboard_period_label?: string | null;
  revenue_in_dashboard_period?: number;
}) {
  return `Business data:\n${JSON.stringify(data, null, 2)}\n\nGenerate insights array.`;
}
