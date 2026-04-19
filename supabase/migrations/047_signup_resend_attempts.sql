-- Audit log and rate-limit basis for signup confirmation resend (server-enforced).
-- Access only via service role from API routes (RLS: no policies for anon/authenticated).

create table if not exists public.signup_resend_attempts (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  ip_address text,
  outcome text not null check (outcome in (
    'sent',
    'rate_limited_email_hour',
    'rate_limited_email_day',
    'rate_limited_ip',
    'invalid_email',
    'supabase_error'
  )),
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.signup_resend_attempts is 'Signup confirmation resend attempts for rate limiting and abuse monitoring.';

create index if not exists signup_resend_attempts_email_sent_hour
  on public.signup_resend_attempts (email_normalized, created_at desc)
  where outcome = 'sent';

create index if not exists signup_resend_attempts_ip_created
  on public.signup_resend_attempts (ip_address, created_at desc)
  where ip_address is not null;

alter table public.signup_resend_attempts enable row level security;
