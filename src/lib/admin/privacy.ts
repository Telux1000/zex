export function maskEmail(email: string | null | undefined): string {
  const value = String(email ?? '').trim();
  if (!value.includes('@')) return 'hidden';
  const [local, domain] = value.split('@');
  if (!local || !domain) return 'hidden';
  const shown = local.slice(0, 2);
  return `${shown}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

export function maskText(value: string | null | undefined): string {
  const s = String(value ?? '').trim();
  if (!s) return 'hidden';
  if (s.length <= 2) return `${s[0] ?? '*'}*`;
  return `${s.slice(0, 1)}${'*'.repeat(Math.max(2, s.length - 2))}${s.slice(-1)}`;
}
