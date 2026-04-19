/** Shape passed by @supabase/ssr to cookie setAll handlers */
export type SupabaseCookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};
