/**
 * Client page creates a Supabase browser client during render; without public Supabase env
 * vars, static prerender would throw. Force dynamic so `next build` succeeds when those
 * vars exist only at runtime (still configure them in Vercel for the app to work).
 */
export const dynamic = 'force-dynamic';

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
