/**
 * Allow only same-origin app paths for post-action redirects (e.g. after adding a customer).
 */
export function sanitizeReturnToPath(path: string | null | undefined): string | null {
  if (path == null || typeof path !== 'string') return null;
  const t = path.trim();
  if (!t.startsWith('/') || t.startsWith('//')) return null;
  if (t.includes('//')) return null;
  const allowed =
    t.startsWith('/dashboard') || t.startsWith('/settings') || t.startsWith('/onboarding');
  if (!allowed) return null;
  return t;
}
