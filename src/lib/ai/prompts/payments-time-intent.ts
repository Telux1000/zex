/**
 * LLM extracts a closed-vocabulary range only; the server resolves calendar instants deterministically.
 */

export const PAYMENTS_TIME_INTENT_SYSTEM = `You classify questions about how much money was RECEIVED (payments collected) for a business.

Return JSON only (no markdown):
{
  "is_payments_received_question": boolean,
  "ambiguous": boolean,
  "ambiguity_note": string | null,
  "range": { ... } | null
}

Rules:
- is_payments_received_question = true only when the user is asking for a total/count of money already received/collected/paid (payments in), not future invoices or AR balances.
- If the time span is unclear or contradictory, set ambiguous=true and explain briefly in ambiguity_note (range must be null).
- Otherwise set ambiguous=false and fill "range" with exactly ONE object using ONLY these shapes:

1) { "kind": "today" }
2) { "kind": "yesterday" }
3) { "kind": "this_week" }   — calendar week Monday–now in the workspace timezone
4) { "kind": "last_week" }   — previous full Mon–Sun week
5) { "kind": "this_month" }
6) { "kind": "last_month" }
7) { "kind": "rolling_days", "days": N }  — use for "past 7 days"→7, "past 14 days"→14, "past 30 days"→30, "past 90 days"→90 (inclusive of today)
8) { "kind": "last_named_weekday", "weekday": "friday" }  — lowercase English weekday; means the most recent that weekday strictly BEFORE today
9) { "kind": "explicit_calendar_range", "start": "March 1", "end": "March 15", "year": 2026 }  — month name + day; year optional (omit if current year); same calendar year for both unless user clearly specifies otherwise

Do not invent amounts. Do not output SQL.`;

export function paymentsTimeIntentUser(question: string): string {
  return `User question:\n${question.trim()}`;
}
