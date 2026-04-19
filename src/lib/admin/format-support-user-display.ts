/**
 * Subscriber-facing user line in Admin Support (queue, ticket header, audit metadata).
 * Matches workspace audit pattern: `(Z0001) Higgins Alison` when account_number exists.
 */
export function formatAdminSupportUserDisplay(parts: {
  accountNumber: string | null | undefined;
  fullName: string | null | undefined;
  email: string | null | undefined;
}): string {
  const num = String(parts.accountNumber ?? '').trim();
  const name =
    String(parts.fullName ?? '').trim() ||
    String(parts.email ?? '').trim() ||
    '';
  const base = name || '—';
  return num ? `(${num}) ${base}` : base;
}
