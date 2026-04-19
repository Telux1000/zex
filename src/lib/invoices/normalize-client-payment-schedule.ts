/** Maps client camelCase payment schedule rows to API snake_case rows for DB upsert. */
export function normalizeClientPaymentScheduleCamel(
  rows: unknown[]
): Array<Record<string, unknown>> {
  return rows.map((raw, index) => {
    const r = raw as Record<string, unknown>;
    const dueRaw = r.due_date ?? r.dueDate;
    const due = dueRaw != null ? String(dueRaw).trim().slice(0, 10) : '';
    const typeStr = String(r.type ?? '').toLowerCase();
    const desc =
      String(r.description ?? '').trim() ||
      (typeStr === 'deposit' ? 'Deposit' : `Payment ${index + 1}`);
    const amt = Number(r.amount);
    const st = String(r.status ?? 'unpaid').toLowerCase();
    const status = st === 'paid' ? 'paid' : 'pending';
    const row: Record<string, unknown> = {
      description: desc,
      amount: amt,
      due_date: due,
      status,
    };
    if (r.id != null && String(r.id).trim() !== '') {
      row.id = String(r.id).trim();
    }
    return row;
  });
}
