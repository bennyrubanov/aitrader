-- Append-only counter signal when home landing client recovery exhausts retries (capped at ingest).
-- RLS on, zero policies: only service role (Route Handler) inserts; cron reads/deletes for digest + retention.

create table if not exists public.landing_recovery_exhausted_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deployment text null
);

create index if not exists landing_recovery_exhausted_events_created_at_idx
  on public.landing_recovery_exhausted_events (created_at desc);

alter table public.landing_recovery_exhausted_events enable row level security;
