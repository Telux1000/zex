/**
 * Rule-based “insights” derived from invoice rows — same source of truth as the
 * full Insights page fallback when ai_insights is empty.
 */

export type DeterministicInsightCard = {
  id: string;
  type: string;
  title: string;
  summary: string;
  severity: 'low' | 'medium' | 'high';
  action_label?: string;
};

export type InvoiceRowForDeterministicInsights = {
  invoice_number?: string | null;
  customer_name?: string | null;
  due_date?: string | null;
  /** Raw DB status (same as Insights page client, not derived). */
  status?: string | null;
  balance_due_safe: number;
  issue_date?: string | null;
  paid_at?: string | null;
};

/**
 * Build the same prioritized fallback list as `dashboard/insights/page.tsx`.
 */
export function buildDeterministicInsights(
  invoices: InvoiceRowForDeterministicInsights[]
): DeterministicInsightCard[] {
  const today = new Date().toISOString().slice(0, 10);
  const in3 = new Date();
  in3.setDate(in3.getDate() + 3);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in3Iso = in3.toISOString().slice(0, 10);
  const in7Iso = in7.toISOString().slice(0, 10);

  const open = invoices.filter(
    (r) =>
      !['paid', 'voided'].includes(String(r.status ?? '')) && r.balance_due_safe > 0
  );
  const overdue = open.filter((r) => String(r.due_date) < today);
  const dueSoon = open.filter(
    (r) => String(r.due_date) >= today && String(r.due_date) <= in3Iso
  );
  const expectedCash7 = open
    .filter((r) => String(r.due_date) >= today && String(r.due_date) <= in7Iso)
    .reduce((s, r) => s + r.balance_due_safe, 0);

  const payerStatsAcc = invoices
    .filter((r) => String(r.status) === 'paid' && r.paid_at && r.issue_date)
    .reduce<Record<string, { days: number[] }>>((acc, row) => {
      const key = String(row.customer_name ?? '').trim() || 'Unknown customer';
      const d =
        Math.round(
          ((new Date(String(row.paid_at)).getTime() -
            new Date(String(row.issue_date)).getTime()) /
            (1000 * 60 * 60 * 24)) *
            10
        ) / 10;
      if (!acc[key]) acc[key] = { days: [] };
      acc[key].days.push(d);
      return acc;
    }, {});

  const behavior = Object.entries(payerStatsAcc)
    .map(([name, v]) => ({
      name,
      avgDays: v.days.length
        ? Math.round((v.days.reduce((s, d) => s + d, 0) / v.days.length) * 10) / 10
        : null,
    }))
    .filter((x) => x.avgDays != null)
    .sort((a, b) => (a.avgDays ?? 0) - (b.avgDays ?? 0));

  const fallback: DeterministicInsightCard[] = [];
  fallback.push({
    id: 'f1',
    type: 'reminder',
    title: `${open.length} open invoices need attention`,
    summary: `Outstanding balance: ${open.reduce((s, r) => s + r.balance_due_safe, 0).toFixed(2)}`,
    severity: open.length > 0 ? 'medium' : 'low',
    action_label: open.length > 0 ? 'Review receivables' : undefined,
  });
  if (dueSoon.length > 0) {
    fallback.push({
      id: 'f2',
      type: 'risk',
      title: `${dueSoon.length} invoices due in 3 days`,
      summary: dueSoon
        .slice(0, 2)
        .map((r) => `${r.invoice_number} (${r.customer_name})`)
        .join(' • '),
      severity: 'high',
      action_label: 'Send reminders',
    });
  }
  if (overdue.length > 0) {
    fallback.push({
      id: 'f3',
      type: 'risk',
      title: `${overdue.length} overdue invoices`,
      summary: `Overdue balance: ${overdue.reduce((s, r) => s + r.balance_due_safe, 0).toFixed(2)}`,
      severity: 'high',
      action_label: 'Follow up today',
    });
  }
  fallback.push({
    id: 'f4',
    type: 'forecast',
    title: 'Expected cash this week',
    summary: `${expectedCash7.toFixed(2)} expected from invoices due within 7 days`,
    severity: expectedCash7 > 0 ? 'medium' : 'low',
  });
  if (behavior.length > 0) {
    fallback.push({
      id: 'f5',
      type: 'behavior',
      title: `${behavior[0].name} usually pays in ${behavior[0].avgDays} days`,
      summary: 'Customer payment behavior from paid invoices',
      severity: 'low',
    });
  }

  return fallback;
}
