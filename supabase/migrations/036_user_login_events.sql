-- Recent sign-in history for Security settings (self-service read/insert only for own user).

create table if not exists public.user_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  status text not null check (status in ('success', 'failed')),
  device_label text,
  ip_display text
);

create index if not exists user_login_events_user_occurred_idx
  on public.user_login_events (user_id, occurred_at desc);

alter table public.user_login_events enable row level security;

create policy "Users read own login events"
  on public.user_login_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own login events"
  on public.user_login_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);
