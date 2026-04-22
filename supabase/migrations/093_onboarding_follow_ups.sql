create table if not exists public.onboarding_follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  onboarding_stage_at_schedule text not null,
  template_id text not null,
  scheduled_for timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'CANCELED')),
  step_key text not null,
  canceled_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_onboarding_follow_ups_user_status
  on public.onboarding_follow_ups (user_id, status);

create index if not exists idx_onboarding_follow_ups_pending_schedule
  on public.onboarding_follow_ups (status, scheduled_for);

alter table public.profiles
  add column if not exists onboarding_follow_ups_paused_at timestamptz null;
