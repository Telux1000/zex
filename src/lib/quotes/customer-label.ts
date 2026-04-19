/** Display name from quote customer_snapshot (company preferred). */
export function customerLabelFromSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object') return 'customer';
  const o = snapshot as Record<string, unknown>;
  const company = String(o.company ?? '').trim();
  const name = String(o.name ?? '').trim();
  return company || name || 'customer';
}
