import type { User } from '@supabase/supabase-js';

/** First token of display name for greetings (e.g. "Hi, Alex."). */
export function greetingFirstNameFromProfileAndUser(
  profile: { full_name?: string | null } | null | undefined,
  user: User
): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const u = user as User & { fullName?: string | null; name?: string | null };
  const profileFull =
    profile?.full_name != null ? String(profile.full_name).trim() : '';
  const displayName =
    profileFull ||
    (typeof u.fullName === 'string' ? u.fullName.trim() : '') ||
    (typeof u.name === 'string' ? u.name.trim() : '') ||
    (typeof meta?.full_name === 'string' ? String(meta.full_name).trim() : '') ||
    (typeof meta?.name === 'string' ? String(meta.name).trim() : '') ||
    '';
  const firstName = displayName.trim().split(/\s+/)[0] || '';
  return firstName;
}
