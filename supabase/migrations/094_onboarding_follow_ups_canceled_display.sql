-- Distinguish "Cancel pending follow-ups" (UI: Cancelled) from "Pause" (UI: Paused).
-- Automation is still off when onboarding_follow_ups_paused_at is set; this column is for display.

alter table public.profiles
  add column if not exists onboarding_follow_ups_canceled_at timestamptz null;

comment on column public.profiles.onboarding_follow_ups_canceled_at is
  'Set when admin used Cancel pending follow-ups; UI shows Cancelled instead of Paused. Cleared when admin uses Pause or Resume.';

notify pgrst, 'reload schema';
